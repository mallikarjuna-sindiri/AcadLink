from fastapi import APIRouter, HTTPException, status, Depends, Query
from models.user import TeacherCreate
from models.content import ContentCreate
from utils.dependencies import require_teacher_or_admin
from config import users_collection, content_collection, holiday_events_collection
from datetime import datetime

router = APIRouter(prefix="/api/teacher", tags=["Faculty"])


def serialize_user(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "name": user.get("name"),
        "email": user.get("email"),
        "picture": user.get("picture", ""),
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
async def create_teacher(body: TeacherCreate, current_user: dict = Depends(require_teacher_or_admin)):
    """Faculty or Admin creates another faculty account."""
    existing = await users_collection.find_one({"email": body.email})
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    new_teacher = {
        "name": body.name,
        "email": body.email,
        "role": "teacher",
        "is_verified": True,
        "created_by": current_user["id"],
        "created_at": datetime.utcnow().isoformat(),
    }
    result = await users_collection.insert_one(new_teacher)
    return {"message": "Faculty account created successfully", "teacher_id": str(result.inserted_id)}


@router.get("/students")
async def get_students(current_user: dict = Depends(require_teacher_or_admin)):
    """Faculty views all student accounts."""
    students = await users_collection.find({"role": "student"}).to_list(length=None)
    return [serialize_user(s) for s in students]


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_content(body: ContentCreate, current_user: dict = Depends(require_teacher_or_admin)):
    """Faculty uploads notes or assignments."""
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
    """Faculty views their own uploaded content."""
    items = await content_collection.find({"teacher_id": current_user["id"]}).to_list(length=None)
    return [serialize_content(c) for c in items]


@router.get("/holiday/list")
async def get_holiday_list(
    year: str | None = Query(default=None),
    current_user: dict = Depends(require_teacher_or_admin),
):
    docs = await holiday_events_collection.find({}, {"_id": 1, "title": 1, "date": 1, "created_at": 1}).to_list(None)

    years = sorted({str(item.get("date", ""))[:4] for item in docs if item.get("date")}, reverse=True)

    if year and (not year.isdigit() or len(year) != 4):
        raise HTTPException(status_code=400, detail="Year must be in YYYY format")

    if year:
        filtered_docs = [item for item in docs if str(item.get("date", "")).startswith(f"{year}-")]
    else:
        filtered_docs = docs

    filtered_docs.sort(key=lambda item: item.get("date") or "")

    items = [
        {
            "id": str(item["_id"]),
            "festival": item.get("title", "Holiday"),
            "iso_date": item.get("date", ""),
            "date": datetime.strptime(item.get("date"), "%Y-%m-%d").strftime("%d-%m-%Y") if item.get("date") else "",
            "created_at": item.get("created_at"),
        }
        for item in filtered_docs
    ]

    return {
        "year": year,
        "years": years,
        "items": items,
    }
