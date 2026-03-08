from fastapi import APIRouter, HTTPException, status, Depends
from models.user import UserCreate
from models.content import ContentCreate, ContentOut
from utils.auth import hash_password
from utils.dependencies import require_teacher_or_admin
from config import users_collection, content_collection
from bson import ObjectId
from datetime import datetime

router = APIRouter(prefix="/api/teacher", tags=["Teacher"])


def serialize_user(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "name": user.get("name"),
        "email": user.get("email"),
        "role": user.get("role"),
        "created_at": user.get("created_at"),
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


@router.post("/create-teacher", status_code=status.HTTP_201_CREATED)
async def create_teacher(body: UserCreate, current_user: dict = Depends(require_teacher_or_admin)):
    """Teacher or Admin creates another teacher account."""
    existing = await users_collection.find_one({"email": body.email})
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    new_teacher = {
        "name": body.name,
        "email": body.email,
        "password": hash_password(body.password),
        "role": "teacher",
        "is_verified": True,
        "created_by": current_user["id"],
        "created_at": datetime.utcnow().isoformat(),
    }
    result = await users_collection.insert_one(new_teacher)
    return {"message": "Teacher account created successfully", "teacher_id": str(result.inserted_id)}


@router.get("/students")
async def get_students(current_user: dict = Depends(require_teacher_or_admin)):
    """Teacher views all student accounts."""
    students = await users_collection.find({"role": "student"}).to_list(length=None)
    return [serialize_user(s) for s in students]


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_content(body: ContentCreate, current_user: dict = Depends(require_teacher_or_admin)):
    """Teacher uploads notes or assignments."""
    new_content = {
        "title": body.title,
        "description": body.description,
        "content_type": body.content_type,
        "teacher_id": current_user["id"],
        "teacher_name": current_user["name"],
        "created_at": datetime.utcnow().isoformat(),
    }
    result = await content_collection.insert_one(new_content)
    return {"message": "Content uploaded successfully", "content_id": str(result.inserted_id)}


@router.get("/my-content")
async def get_my_content(current_user: dict = Depends(require_teacher_or_admin)):
    """Teacher views their own uploaded content."""
    items = await content_collection.find({"teacher_id": current_user["id"]}).to_list(length=None)
    return [serialize_content(c) for c in items]
