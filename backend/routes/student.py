from fastapi import APIRouter, HTTPException, status, Depends
from models.submission import SubmissionCreate
from utils.dependencies import require_student
from config import users_collection, content_collection, submissions_collection
from bson import ObjectId
from datetime import datetime

router = APIRouter(prefix="/api/student", tags=["Student"])


def serialize_user(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "name": user.get("name"),
        "email": user.get("email"),
        "role": user.get("role"),
    }


def serialize_content(c: dict) -> dict:
    return {
        "id": str(c["_id"]),
        "title": c.get("title"),
        "description": c.get("description"),
        "content_type": c.get("content_type"),
        "teacher_id": c.get("teacher_id"),
        "teacher_name": c.get("teacher_name"),
        "created_at": c.get("created_at"),
    }


@router.get("/teachers")
async def get_teachers(current_user: dict = Depends(require_student)):
    """Student views all teachers."""
    teachers = await users_collection.find({"role": "teacher"}).to_list(length=None)
    return [serialize_user(t) for t in teachers]


@router.get("/content")
async def get_content(current_user: dict = Depends(require_student)):
    """Student views all published notes and assignments."""
    items = await content_collection.find().to_list(length=None)
    return [serialize_content(c) for c in items]


@router.post("/submit", status_code=status.HTTP_201_CREATED)
async def submit_assignment(body: SubmissionCreate, current_user: dict = Depends(require_student)):
    """Student submits an assignment answer."""
    try:
        content = await content_collection.find_one({"_id": ObjectId(body.content_id)})
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid content ID")

    if not content:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")

    if content.get("content_type") != "assignment":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This content is not an assignment")

    # Check for duplicate submission
    existing = await submissions_collection.find_one({
        "content_id": body.content_id,
        "student_id": current_user["id"],
    })
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You have already submitted this assignment")

    submission = {
        "content_id": body.content_id,
        "student_id": current_user["id"],
        "student_name": current_user["name"],
        "teacher_id": content.get("teacher_id"),
        "answer": body.answer,
        "submitted_at": datetime.utcnow().isoformat(),
    }
    result = await submissions_collection.insert_one(submission)
    return {"message": "Assignment submitted successfully", "submission_id": str(result.inserted_id)}
