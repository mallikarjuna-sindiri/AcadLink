import os
from glob import glob
import aiofiles
from fastapi import APIRouter, HTTPException, status, Depends, File, UploadFile
from fastapi.responses import FileResponse
from models.mcq import MCQTestCreate, MCQAttemptSubmit
from utils.dependencies import require_teacher_or_admin, require_any
from config import mcq_tests_collection, mcq_attempts_collection, UPLOAD_DIR
from bson import ObjectId
from datetime import datetime

router = APIRouter(prefix="/api/subjects/{subject_id}/tests", tags=["MCQ Tests"])


def cleanup_attempt_recordings(attempt_id: str):
    pattern = os.path.join(UPLOAD_DIR, f"attempt_{attempt_id}_recording.*")
    for filepath in glob(pattern):
        try:
            os.remove(filepath)
        except OSError:
            continue


def serialize_test(t: dict, hide_answers: bool = True) -> dict:
    questions = t.get("questions", [])
    if hide_answers:
        questions = [
            {
                "question_text": q.get("question_text"),
                "options": q.get("options"),
            }
            for q in questions
        ]
    return {
        "id": str(t["_id"]),
        "subject_id": t.get("subject_id"),
        "title": t.get("title"),
        "time_limit_minutes": t.get("time_limit_minutes"),
        "deadline": t.get("deadline"),
        "question_count": len(t.get("questions", [])),
        "questions": questions,
        "created_by": t.get("created_by"),
        "created_by_name": t.get("created_by_name"),
        "created_at": t.get("created_at"),
    }


# ── Teacher: create MCQ test ─────────────────────────────────────────────────
@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_test(
    subject_id: str,
    body: MCQTestCreate,
    current_user: dict = Depends(require_teacher_or_admin),
):
    test = {
        "subject_id": subject_id,
        "title": body.title,
        "time_limit_minutes": body.time_limit_minutes,
        "deadline": body.deadline,
        "questions": [q.dict() for q in body.questions],
        "created_by": current_user["id"],
        "created_by_name": current_user["name"],
        "created_at": datetime.utcnow().isoformat(),
    }
    result = await mcq_tests_collection.insert_one(test)
    return {"message": "Test created", "test_id": str(result.inserted_id)}


# ── List tests ───────────────────────────────────────────────────────────────
@router.get("/")
async def list_tests(subject_id: str, current_user: dict = Depends(require_any)):
    tests = await mcq_tests_collection.find({"subject_id": subject_id}).to_list(None)
    is_teacher = current_user["role"] in ("teacher", "admin")
    return [serialize_test(t, hide_answers=not is_teacher) for t in tests]


# ── Get single test ──────────────────────────────────────────────────────────
@router.get("/{test_id}")
async def get_test(
    subject_id: str,
    test_id: str,
    current_user: dict = Depends(require_any),
):
    t = await mcq_tests_collection.find_one({"_id": ObjectId(test_id)})
    if not t:
        raise HTTPException(status_code=404, detail="Test not found")

    is_teacher = current_user["role"] in ("teacher", "admin")
    return serialize_test(t, hide_answers=not is_teacher)


# ── Teacher: update MCQ test ───────────────────────────────────────────────
@router.put("/{test_id}")
async def update_test(
    subject_id: str,
    test_id: str,
    body: MCQTestCreate,
    current_user: dict = Depends(require_teacher_or_admin),
):
    existing = await mcq_tests_collection.find_one({"_id": ObjectId(test_id), "subject_id": subject_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Test not found")

    payload = {
        "title": body.title,
        "time_limit_minutes": body.time_limit_minutes,
        "deadline": body.deadline,
        "questions": [q.dict() for q in body.questions],
        "updated_at": datetime.utcnow().isoformat(),
        "updated_by": current_user["id"],
    }

    await mcq_tests_collection.update_one(
        {"_id": ObjectId(test_id)},
        {"$set": payload},
    )

    return {"message": "Test updated successfully", "test_id": test_id}


# ── Teacher: delete MCQ test ───────────────────────────────────────────────
@router.delete("/{test_id}")
async def delete_test(
    subject_id: str,
    test_id: str,
    current_user: dict = Depends(require_teacher_or_admin),
):
    existing = await mcq_tests_collection.find_one({"_id": ObjectId(test_id), "subject_id": subject_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Test not found")

    attempts = await mcq_attempts_collection.find({"test_id": test_id}, {"_id": 1}).to_list(None)
    for attempt in attempts:
        cleanup_attempt_recordings(str(attempt.get("_id")))

    await mcq_attempts_collection.delete_many({"test_id": test_id})
    await mcq_tests_collection.delete_one({"_id": ObjectId(test_id)})

    return {"message": "Test deleted successfully", "test_id": test_id}


# ── Student: submit attempt ──────────────────────────────────────────────────
@router.post("/{test_id}/attempt", status_code=status.HTTP_201_CREATED)
async def submit_attempt(
    subject_id: str,
    test_id: str,
    body: MCQAttemptSubmit,
    current_user: dict = Depends(require_any),
):
    t = await mcq_tests_collection.find_one({"_id": ObjectId(test_id)})
    if not t:
        raise HTTPException(status_code=404, detail="Test not found")

    # Duplicate attempt check
    existing = await mcq_attempts_collection.find_one({
        "test_id": test_id,
        "student_id": current_user["id"],
    })
    if existing:
        raise HTTPException(status_code=400, detail="You have already attempted this test")

    questions = t.get("questions", [])
    if len(body.answers) != len(questions):
        raise HTTPException(
            status_code=400,
            detail=f"Expected {len(questions)} answers, got {len(body.answers)}",
        )

    for i, answer in enumerate(body.answers):
        if answer == -1:
            continue
        options = questions[i].get("options", [])
        if answer < 0 or answer >= len(options):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid answer index for question {i + 1}",
            )

    # Auto-score
    score = 0
    for i, q in enumerate(questions):
        selected = body.answers[i]
        if selected != -1 and selected == q.get("correct_answer"):
            score += 1

    attempt = {
        "test_id": test_id,
        "subject_id": subject_id,
        "student_id": current_user["id"],
        "student_name": current_user["name"],
        "student_email": current_user.get("email", ""),
        "answers": body.answers,
        "score": score,
        "total_questions": len(questions),
        "submitted_at": datetime.utcnow().isoformat(),
    }
    result = await mcq_attempts_collection.insert_one(attempt)

    return {
        "message": "Test submitted",
        "score": score,
        "total": len(questions),
        "percentage": round((score / len(questions)) * 100, 1) if questions else 0,
        "attempt_id": str(result.inserted_id),
    }


# ── Student: my attempt for a test ──────────────────────────────────────────
@router.get("/{test_id}/my-attempt")
async def my_attempt(
    subject_id: str,
    test_id: str,
    current_user: dict = Depends(require_any),
):
    a = await mcq_attempts_collection.find_one({
        "test_id": test_id,
        "student_id": current_user["id"],
    })
    if not a:
        return {"attempted": False}
    return {
        "attempted": True,
        "score": a.get("score"),
        "total_questions": a.get("total_questions"),
        "percentage": round((a["score"] / a["total_questions"]) * 100, 1) if a.get("total_questions") else 0,
        "submitted_at": a.get("submitted_at"),
    }


# ── Teacher: all attempts for a test ────────────────────────────────────────
@router.get("/{test_id}/attempts")
async def all_attempts(
    subject_id: str,
    test_id: str,
    current_user: dict = Depends(require_teacher_or_admin),
):
    attempts = await mcq_attempts_collection.find({"test_id": test_id}).to_list(None)
    return [
        {
            "id": str(a["_id"]),
            "student_id": a.get("student_id"),
            "student_name": a.get("student_name"),
            "student_email": a.get("student_email", ""),
            "score": a.get("score"),
            "total_questions": a.get("total_questions"),
            "percentage": round((a["score"] / a["total_questions"]) * 100, 1) if a.get("total_questions") else 0,
            "submitted_at": a.get("submitted_at"),
            "recording_url": a.get("recording_url"),
        }
        for a in attempts
    ]


# ── Teacher: reset one student's attempt ────────────────────────────────────
@router.delete("/{test_id}/attempts/{attempt_id}")
async def reset_attempt(
    subject_id: str,
    test_id: str,
    attempt_id: str,
    current_user: dict = Depends(require_teacher_or_admin),
):
    attempt = await mcq_attempts_collection.find_one({
        "_id": ObjectId(attempt_id),
        "test_id": test_id,
        "subject_id": subject_id,
    })
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    await mcq_attempts_collection.delete_one({"_id": ObjectId(attempt_id)})
    cleanup_attempt_recordings(attempt_id)

    return {
        "message": "Attempt reset successfully",
        "attempt_id": attempt_id,
        "student_id": attempt.get("student_id"),
    }


# ── Student: upload recording ────────────────────────────────────────
@router.post("/{test_id}/attempts/{attempt_id}/recording", status_code=status.HTTP_201_CREATED)
async def upload_attempt_recording(
    subject_id: str,
    test_id: str,
    attempt_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_any),
):
    attempt = await mcq_attempts_collection.find_one({"_id": ObjectId(attempt_id), "student_id": current_user["id"]})
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
        
    ext = file.filename.split('.')[-1] if '.' in file.filename else 'webm'
    filename = f"attempt_{attempt_id}_recording.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    
    async with aiofiles.open(filepath, 'wb') as out_file:
        content = await file.read()
        await out_file.write(content)

    video_url = f"/api/subjects/{subject_id}/tests/{test_id}/attempts/{attempt_id}/video"
    await mcq_attempts_collection.update_one(
        {"_id": ObjectId(attempt_id)},
        {"$set": {"recording_url": video_url}}
    )
    return {"message": "Recording uploaded", "url": video_url}


# ── Teacher: watch recording ────────────────────────────────────────
@router.get("/{test_id}/attempts/{attempt_id}/video")
async def get_attempt_video(
    subject_id: str,
    test_id: str,
    attempt_id: str,
    current_user: dict = Depends(require_teacher_or_admin)
):
    attempt = await mcq_attempts_collection.find_one({"_id": ObjectId(attempt_id)})
    if not attempt or not attempt.get("recording_url"):
        raise HTTPException(status_code=404, detail="Recording not found")
        
    filename = attempt["recording_url"].split('/')[-1]
    # We used attempt_id_recording.webm
    filepath = os.path.join(UPLOAD_DIR, f"attempt_{attempt_id}_recording.webm")
    if os.path.exists(filepath):
        return FileResponse(filepath, media_type="video/webm")
    raise HTTPException(status_code=404, detail="File not found")
