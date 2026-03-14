import os
import aiofiles
from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File, Form
from fastapi.responses import FileResponse
from models.assignment import AssignmentCreate, GradeSubmission
from utils.dependencies import require_teacher_or_admin, require_any, require_student
from config import assignments_collection, submissions_collection, subject_members_collection, UPLOAD_DIR
from bson import ObjectId
from datetime import datetime

router = APIRouter(prefix="/api/subjects/{subject_id}/assignments", tags=["Assignments"])


def serialize_assignment(a: dict) -> dict:
    return {
        "id": str(a["_id"]),
        "subject_id": a.get("subject_id"),
        "title": a.get("title"),
        "description": a.get("description"),
        "deadline": a.get("deadline"),
        "max_marks": a.get("max_marks"),
        "created_by": a.get("created_by"),
        "created_by_name": a.get("created_by_name"),
        "created_at": a.get("created_at"),
    }


def serialize_submission(s: dict) -> dict:
    return {
        "id": str(s["_id"]),
        "assignment_id": s.get("assignment_id"),
        "student_id": s.get("student_id"),
        "student_name": s.get("student_name"),
        "student_email": s.get("student_email", ""),
        "file_name": s.get("file_name"),
        "text_answer": s.get("text_answer"),
        "submitted_at": s.get("submitted_at"),
        "marks_obtained": s.get("marks_obtained"),
        "feedback": s.get("feedback"),
        "graded_at": s.get("graded_at"),
    }


# ── Teacher: create assignment ───────────────────────────────────────────────
@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_assignment(
    subject_id: str,
    body: AssignmentCreate,
    current_user: dict = Depends(require_teacher_or_admin),
):
    assignment = {
        "subject_id": subject_id,
        "title": body.title,
        "description": body.description,
        "deadline": body.deadline,
        "max_marks": body.max_marks,
        "created_by": current_user["id"],
        "created_by_name": current_user["name"],
        "created_at": datetime.utcnow().isoformat(),
    }
    result = await assignments_collection.insert_one(assignment)
    return {"message": "Assignment created", "assignment_id": str(result.inserted_id)}


# ── Teacher: update assignment ──────────────────────────────────────────────
@router.put("/{assignment_id}")
async def update_assignment(
    subject_id: str,
    assignment_id: str,
    body: AssignmentCreate,
    current_user: dict = Depends(require_teacher_or_admin),
):
    assignment = await assignments_collection.find_one({
        "_id": ObjectId(assignment_id),
        "subject_id": subject_id,
    })
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    await assignments_collection.update_one(
        {"_id": ObjectId(assignment_id)},
        {
            "$set": {
                "title": body.title,
                "description": body.description,
                "deadline": body.deadline,
                "max_marks": body.max_marks,
                "updated_at": datetime.utcnow().isoformat(),
                "updated_by": current_user["id"],
            }
        },
    )

    return {"message": "Assignment updated", "assignment_id": assignment_id}


# ── List assignments ─────────────────────────────────────────────────────────
@router.get("/")
async def list_assignments(subject_id: str, current_user: dict = Depends(require_any)):
    items = await assignments_collection.find({"subject_id": subject_id}).to_list(None)
    return [serialize_assignment(a) for a in items]


# ── Student: submit assignment ───────────────────────────────────────────────
@router.post("/{assignment_id}/submit", status_code=status.HTTP_201_CREATED)
async def submit_assignment(
    subject_id: str,
    assignment_id: str,
    text_answer: str = Form(default=""),
    file: UploadFile = File(default=None),
    current_user: dict = Depends(require_any),
):
    assignment = await assignments_collection.find_one({"_id": ObjectId(assignment_id)})
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Check deadline
    deadline = assignment.get("deadline", "")
    if deadline:
        try:
            dl = datetime.fromisoformat(deadline.replace("Z", "+00:00"))
            if datetime.utcnow() > dl.replace(tzinfo=None):
                raise HTTPException(status_code=400, detail="Deadline has passed")
        except ValueError:
            pass

    # Duplicate check
    existing = await submissions_collection.find_one({
        "assignment_id": assignment_id,
        "student_id": current_user["id"],
    })
    if existing:
        raise HTTPException(status_code=400, detail="You have already submitted this assignment")

    # Handle file
    file_name = None
    file_path = None
    if file and file.filename:
        dir_path = os.path.join(UPLOAD_DIR, subject_id, "submissions")
        os.makedirs(dir_path, exist_ok=True)
        safe_name = f"{datetime.utcnow().timestamp()}_{file.filename}"
        file_path = os.path.join(dir_path, safe_name)
        content = await file.read()
        async with aiofiles.open(file_path, "wb") as f:
            await f.write(content)
        file_name = file.filename

    submission = {
        "assignment_id": assignment_id,
        "subject_id": subject_id,
        "student_id": current_user["id"],
        "student_name": current_user["name"],
        "student_email": current_user.get("email", ""),
        "text_answer": text_answer,
        "file_name": file_name,
        "file_path": file_path,
        "submitted_at": datetime.utcnow().isoformat(),
        "marks_obtained": None,
        "feedback": None,
        "graded_at": None,
    }
    result = await submissions_collection.insert_one(submission)
    return {"message": "Assignment submitted", "submission_id": str(result.inserted_id)}


# ── Teacher: view submissions for an assignment ──────────────────────────────
@router.get("/{assignment_id}/submissions")
async def get_submissions(
    subject_id: str,
    assignment_id: str,
    current_user: dict = Depends(require_teacher_or_admin),
):
    subs = await submissions_collection.find({"assignment_id": assignment_id}).to_list(None)
    return [serialize_submission(s) for s in subs]


# ── Student: view my submission ──────────────────────────────────────────────
@router.get("/{assignment_id}/my-submission")
async def my_submission(
    subject_id: str,
    assignment_id: str,
    current_user: dict = Depends(require_any),
):
    sub = await submissions_collection.find_one({
        "assignment_id": assignment_id,
        "student_id": current_user["id"],
    })
    if not sub:
        return {"submitted": False}
    return {"submitted": True, **serialize_submission(sub)}


# ── Teacher: grade a submission ──────────────────────────────────────────────
@router.patch("/{assignment_id}/submissions/{submission_id}/grade")
async def grade_submission(
    subject_id: str,
    assignment_id: str,
    submission_id: str,
    body: GradeSubmission,
    current_user: dict = Depends(require_teacher_or_admin),
):
    sub = await submissions_collection.find_one({"_id": ObjectId(submission_id)})
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    await submissions_collection.update_one(
        {"_id": ObjectId(submission_id)},
        {"$set": {
            "marks_obtained": body.marks_obtained,
            "feedback": body.feedback,
            "graded_at": datetime.utcnow().isoformat(),
            "graded_by": current_user["id"],
        }},
    )
    return {"message": "Submission graded"}
