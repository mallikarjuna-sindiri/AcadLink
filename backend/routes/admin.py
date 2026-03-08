from fastapi import APIRouter, HTTPException, status, Depends
from models.user import TeacherCreate
from utils.dependencies import require_admin
from config import users_collection, subjects_collection, subject_members_collection
from bson import ObjectId
from datetime import datetime

router = APIRouter(prefix="/api/admin", tags=["Admin"])


def serialize_user(u: dict) -> dict:
    return {
        "id": str(u["_id"]),
        "name": u.get("name"),
        "email": u.get("email"),
        "role": u.get("role"),
        "picture": u.get("picture", ""),
        "is_active": u.get("is_active", True),
        "created_at": u.get("created_at"),
        "created_by": u.get("created_by"),
    }


# ── Dashboard stats ─────────────────────────────────────────────────────────
@router.get("/dashboard")
async def dashboard(current_user: dict = Depends(require_admin)):
    total_users = await users_collection.count_documents({"role": {"$in": ["teacher", "student"]}})
    total_teachers = await users_collection.count_documents({"role": "teacher"})
    total_students = await users_collection.count_documents({"role": "student"})
    total_subjects = await subjects_collection.count_documents({})
    total_enrollments = await subject_members_collection.count_documents({})
    return {
        "total_users": total_users,
        "total_teachers": total_teachers,
        "total_students": total_students,
        "total_subjects": total_subjects,
        "total_enrollments": total_enrollments,
    }


# ── Create teacher ───────────────────────────────────────────────────────────
@router.post("/create-teacher", status_code=status.HTTP_201_CREATED)
async def create_teacher(body: TeacherCreate, current_user: dict = Depends(require_admin)):
    """Admin creates a teacher account by email (teacher must use same email to login via Google)."""
    email = body.email.lower().strip()
    existing = await users_collection.find_one({"email": email})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    new_teacher = {
        "name": body.name,
        "email": email,
        "google_id": None,
        "picture": "",
        "role": "teacher",
        "is_active": True,
        "created_by": current_user["id"],
        "created_at": datetime.utcnow().isoformat(),
    }
    result = await users_collection.insert_one(new_teacher)
    return {"message": "Teacher account created", "teacher_id": str(result.inserted_id)}


# ── List teachers ────────────────────────────────────────────────────────────
@router.get("/teachers")
async def get_teachers(current_user: dict = Depends(require_admin)):
    teachers = await users_collection.find({"role": "teacher"}).to_list(None)
    return [serialize_user(t) for t in teachers]


# ── List students ────────────────────────────────────────────────────────────
@router.get("/students")
async def get_students(current_user: dict = Depends(require_admin)):
    students = await users_collection.find({"role": "student"}).to_list(None)
    return [serialize_user(s) for s in students]


# ── All subjects ─────────────────────────────────────────────────────────────
@router.get("/subjects")
async def get_all_subjects(current_user: dict = Depends(require_admin)):
    subjects = await subjects_collection.find().to_list(None)
    result = []
    for s in subjects:
        count = await subject_members_collection.count_documents({"subject_id": str(s["_id"])})
        result.append({
            "id": str(s["_id"]),
            "name": s.get("name"),
            "year": s.get("year"),
            "semester": s.get("semester"),
            "branch": s.get("branch"),
            "subject_code": s.get("subject_code"),
            "teacher_name": s.get("teacher_name"),
            "teacher_email": s.get("teacher_email", ""),
            "student_count": count,
            "created_at": s.get("created_at"),
        })
    return result


# ── Toggle user active status ────────────────────────────────────────────────
@router.patch("/user/{user_id}/toggle-status")
async def toggle_user_status(user_id: str, current_user: dict = Depends(require_admin)):
    try:
        obj_id = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    user = await users_collection.find_one({"_id": obj_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    new_status = not user.get("is_active", True)
    await users_collection.update_one({"_id": obj_id}, {"$set": {"is_active": new_status}})
    return {"message": f"User {'activated' if new_status else 'deactivated'}", "is_active": new_status}


# ── Delete teacher ───────────────────────────────────────────────────────────
@router.delete("/teacher/{teacher_id}")
async def delete_teacher(teacher_id: str, current_user: dict = Depends(require_admin)):
    try:
        obj_id = ObjectId(teacher_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID")

    teacher = await users_collection.find_one({"_id": obj_id, "role": "teacher"})
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")

    await users_collection.delete_one({"_id": obj_id})
    return {"message": "Teacher deleted"}
