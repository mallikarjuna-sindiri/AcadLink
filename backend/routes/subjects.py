import random
import string
import base64
import qrcode
from io import BytesIO
from fastapi import APIRouter, HTTPException, status, Depends
from models.subject import SubjectCreate
from utils.dependencies import require_teacher_or_admin, require_any
from config import subjects_collection, subject_members_collection, users_collection
from bson import ObjectId
from datetime import datetime

router = APIRouter(prefix="/api/subjects", tags=["Subjects"])


# ── Helpers ──────────────────────────────────────────────────────────────────
def generate_subject_code() -> str:
    letters = "".join(random.choices(string.ascii_uppercase, k=3))
    digits = "".join(random.choices(string.digits, k=4))
    return f"{letters}{digits}"


def generate_qr_base64(data: str) -> str:
    qr = qrcode.QRCode(version=1, box_size=8, border=4)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def serialize_subject(s: dict, count: int = 0) -> dict:
    return {
        "id": str(s["_id"]),
        "name": s.get("name"),
        "year": s.get("year"),
        "semester": s.get("semester"),
        "branch": s.get("branch"),
        "subject_code": s.get("subject_code"),
        "qr_code": s.get("qr_code", ""),
        "teacher_id": s.get("teacher_id"),
        "teacher_name": s.get("teacher_name"),
        "teacher_picture": s.get("teacher_picture", ""),
        "student_count": count,
        "created_at": s.get("created_at"),
    }


# ── Teacher: create subject ──────────────────────────────────────────────────
@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_subject(
    body: SubjectCreate,
    current_user: dict = Depends(require_teacher_or_admin),
):
    # Generate unique subject code
    while True:
        code = generate_subject_code()
        if not await subjects_collection.find_one({"subject_code": code}):
            break

    # Embed full join URL using local network IP so it scan directly on phone
    qr_url = f"http://192.168.31.124:5173/?joinCode={code}"
    qr = generate_qr_base64(qr_url)

    subject = {
        "name": body.name,
        "year": body.year,
        "semester": body.semester,
        "branch": body.branch,
        "subject_code": code,
        "qr_code": qr,
        "teacher_id": current_user["id"],
        "teacher_name": current_user["name"],
        "teacher_email": current_user["email"],
        "teacher_picture": current_user.get("picture", ""),
        "created_at": datetime.utcnow().isoformat(),
    }
    result = await subjects_collection.insert_one(subject)
    return {
        "message": "Subject created",
        "subject_id": str(result.inserted_id),
        "subject_code": code,
        "qr_code": qr,
    }


# ── Teacher: my subjects ────────────────────────────────────────────────────
@router.get("/my")
async def my_subjects(current_user: dict = Depends(require_teacher_or_admin)):
    subjects = await subjects_collection.find({"teacher_id": current_user["id"]}).to_list(None)
    result = []
    for s in subjects:
        count = await subject_members_collection.count_documents({"subject_id": str(s["_id"])})
        result.append(serialize_subject(s, count))
    return result


# ── Student: joined subjects ────────────────────────────────────────────────
@router.get("/joined")
async def joined_subjects(current_user: dict = Depends(require_any)):
    memberships = await subject_members_collection.find({"student_id": current_user["id"]}).to_list(None)
    result = []
    for m in memberships:
        s = await subjects_collection.find_one({"_id": ObjectId(m["subject_id"])})
        if s:
            count = await subject_members_collection.count_documents({"subject_id": m["subject_id"]})
            result.append(serialize_subject(s, count))
    return result


# ── Student: join by code ───────────────────────────────────────────────────
@router.post("/join")
async def join_subject(body: dict, current_user: dict = Depends(require_any)):
    code = body.get("subject_code", "").strip().upper()
    subject = await subjects_collection.find_one({"subject_code": code})
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found. Check your code.")

    subject_id = str(subject["_id"])

    # Already joined?
    existing = await subject_members_collection.find_one({
        "subject_id": subject_id,
        "student_id": current_user["id"],
    })
    if existing:
        raise HTTPException(status_code=400, detail="You are already enrolled in this subject.")

    await subject_members_collection.insert_one({
        "subject_id": subject_id,
        "student_id": current_user["id"],
        "student_name": current_user["name"],
        "student_email": current_user["email"],
        "student_picture": current_user.get("picture", ""),
        "joined_at": datetime.utcnow().isoformat(),
    })
    return {"message": f"Successfully joined {subject['name']}", "subject_id": subject_id}


# ── Get subject details ─────────────────────────────────────────────────────
@router.get("/{subject_id}")
async def get_subject(subject_id: str, current_user: dict = Depends(require_any)):
    try:
        obj_id = ObjectId(subject_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid subject ID")

    s = await subjects_collection.find_one({"_id": obj_id})
    if not s:
        raise HTTPException(status_code=404, detail="Subject not found")

    count = await subject_members_collection.count_documents({"subject_id": subject_id})
    return serialize_subject(s, count)


# ── Get subject members (teacher only) ─────────────────────────────────────
@router.get("/{subject_id}/members")
async def get_members(subject_id: str, current_user: dict = Depends(require_teacher_or_admin)):
    members = await subject_members_collection.find({"subject_id": subject_id}).to_list(None)
    return [
        {
            "student_id": m.get("student_id"),
            "student_name": m.get("student_name"),
            "student_email": m.get("student_email"),
            "student_picture": m.get("student_picture", ""),
            "joined_at": m.get("joined_at"),
        }
        for m in members
    ]
