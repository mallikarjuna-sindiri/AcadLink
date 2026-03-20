import json
import os
import calendar
from typing import List, Dict, Any

from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File
from models.user import TeacherCreate
from utils.dependencies import require_admin
from config import (
    db,
    users_collection,
    subjects_collection,
    subject_members_collection,
    materials_collection,
    assignments_collection,
    submissions_collection,
    mcq_tests_collection,
    mcq_attempts_collection,
    chat_messages_collection,
    holiday_events_collection,
)
from bson import ObjectId
from datetime import datetime
from google import genai
from google.genai import types

router = APIRouter(prefix="/api/admin", tags=["Admin"])
user_notifications_collection = db["user_notifications"]
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")


def calculate_recurring_dates(year: int, recurring_rules: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    day_map = {
        "Monday": calendar.MONDAY,
        "Tuesday": calendar.TUESDAY,
        "Wednesday": calendar.WEDNESDAY,
        "Thursday": calendar.THURSDAY,
        "Friday": calendar.FRIDAY,
        "Saturday": calendar.SATURDAY,
        "Sunday": calendar.SUNDAY,
    }

    extra_holidays = []

    for rule in recurring_rules:
        day_str = rule.get("day_of_week")
        weeks = rule.get("weeks_of_month", [])

        if not isinstance(day_str, str) or day_str not in day_map or not weeks:
            continue

        target_weekday = day_map[day_str]

        for month in range(1, 13):
            month_cal = calendar.monthcalendar(year, month)
            target_dates = [week[target_weekday] for week in month_cal if week[target_weekday] != 0]

            for week_num in weeks:
                if 1 <= week_num <= len(target_dates):
                    day_val = target_dates[week_num - 1]
                    date_str = f"{day_val:02d}-{month:02d}-{year}"

                    if 11 <= (week_num % 100) <= 13:
                        suffix = 'th'
                    else:
                        suffix = {1: 'st', 2: 'nd', 3: 'rd'}.get(week_num % 10, 'th')

                    festival_name = f"{week_num}{suffix} {day_str}"

                    extra_holidays.append({
                        "festival": festival_name,
                        "date": date_str,
                    })

    return extra_holidays


def _to_iso_date(date_str: str, default_year: int | None = None):
    normalized = (date_str or "").replace(".", "-").replace("/", "-").strip()

    date_formats = [
        "%d-%m-%Y",
        "%Y-%m-%d",
        "%d-%m-%y",
        "%d-%b-%Y",
        "%d-%B-%Y",
    ]

    for date_format in date_formats:
        try:
            parsed = datetime.strptime(normalized, date_format)
            return parsed.strftime("%Y-%m-%d")
        except Exception:
            continue

    parts = normalized.split("-")
    if len(parts) == 2 and default_year:
        try:
            day = int(parts[0])
            month = int(parts[1])
            parsed = datetime(default_year, month, day)
            return parsed.strftime("%Y-%m-%d")
        except Exception:
            return None

    return None


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
    return {"message": "Faculty account created", "teacher_id": str(result.inserted_id)}


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
        raise HTTPException(status_code=404, detail="Faculty not found")

    await users_collection.delete_one({"_id": obj_id})
    return {"message": "Faculty deleted"}


# ── Delete subject ───────────────────────────────────────────────────────────
@router.delete("/subject/{subject_id}")
async def delete_subject(subject_id: str, current_user: dict = Depends(require_admin)):
    try:
        obj_id = ObjectId(subject_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid subject ID")

    subject = await subjects_collection.find_one({"_id": obj_id})
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    members = await subject_members_collection.find({"subject_id": subject_id}, {"student_id": 1}).to_list(None)
    recipient_ids = {m.get("student_id") for m in members if m.get("student_id")}
    teacher_id = subject.get("teacher_id")
    if teacher_id:
        recipient_ids.add(teacher_id)

    subject_name = subject.get("name", "Subject")
    deleted_at = datetime.utcnow().isoformat()

    if recipient_ids:
        docs = []
        for user_id in recipient_ids:
            event_id = f"subject_deleted_{subject_id}_{deleted_at}"
            docs.append({
                "_id": f"{user_id}::{event_id}",
                "user_id": user_id,
                "id": event_id,
                "type": "subject_deleted",
                "subject_id": subject_id,
                "subject_name": subject_name,
                "title": "Subject deleted",
                "message": f"{subject_name} was deleted by admin",
                "created_at": deleted_at,
            })
        await user_notifications_collection.insert_many(docs, ordered=False)

    assignment_ids = [str(a["_id"]) for a in await assignments_collection.find({"subject_id": subject_id}).to_list(None)]
    test_ids = [str(t["_id"]) for t in await mcq_tests_collection.find({"subject_id": subject_id}).to_list(None)]

    await subjects_collection.delete_one({"_id": obj_id})
    await subject_members_collection.delete_many({"subject_id": subject_id})
    await materials_collection.delete_many({"subject_id": subject_id})
    await assignments_collection.delete_many({"subject_id": subject_id})
    await submissions_collection.delete_many({"subject_id": subject_id})
    if assignment_ids:
        await submissions_collection.delete_many({"assignment_id": {"$in": assignment_ids}})
    await mcq_tests_collection.delete_many({"subject_id": subject_id})
    await mcq_attempts_collection.delete_many({"subject_id": subject_id})
    if test_ids:
        await mcq_attempts_collection.delete_many({"test_id": {"$in": test_ids}})
    await chat_messages_collection.delete_many({"subject_id": subject_id})

    return {"message": "Subject deleted"}


@router.post("/holiday/extract-festivals")
async def extract_festivals(file: UploadFile = File(...), current_user: dict = Depends(require_admin)):
    if not GEMINI_API_KEY or GEMINI_API_KEY == "YOUR_API_KEY_HERE":
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured in .env")

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    try:
        content = await file.read()
        client = genai.Client(api_key=GEMINI_API_KEY)

        prompt = """
        Extract all the holidays/festivals and dates from this calendar image. Keep the chronological order.
        Also, look for any recurring holiday rules written in the text, such as 'Every 2nd and 4th Saturday is a Holiday'.
        Return the calendar year, the explicit list of holidays, and any recurring rules.
        """

        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[prompt, types.Part.from_bytes(data=content, mime_type=file.content_type)],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "object",
                    "properties": {
                        "year": {"type": "integer", "description": "The calendar year, e.g., 2026"},
                        "holidays": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "festival": {"type": "string", "description": "The name of the occasion or festival."},
                                    "date": {"type": "string", "description": "The date of the festival in DD-MM-YYYY format."},
                                },
                                "required": ["festival", "date"],
                            },
                        },
                        "recurring_rules": {
                            "type": "array",
                            "description": "Rules for recurring holidays noted in the calendar text",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "day_of_week": {"type": "string", "enum": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]},
                                    "weeks_of_month": {"type": "array", "items": {"type": "integer"}, "description": "Which occurrences in the month (e.g., [2, 4] for 2nd and 4th)"},
                                    "description": {"type": "string"},
                                },
                                "required": ["day_of_week", "weeks_of_month", "description"],
                            },
                        },
                    },
                    "required": ["year", "holidays", "recurring_rules"],
                },
            ),
        )

        result = json.loads(response.text)
        year = result.get("year", 2026)
        holidays = result.get("holidays", [])
        recurring_rules = result.get("recurring_rules", [])

        if recurring_rules:
            extra_holidays = calculate_recurring_dates(year, recurring_rules)
            holidays.extend(extra_holidays)

        normalized_items = []
        for item in holidays:
            festival = (item.get("festival") or "Holiday").strip()
            date = (item.get("date") or "").strip()
            iso_date = _to_iso_date(date, year)
            if not iso_date:
                continue
            normalized_date = datetime.strptime(iso_date, "%Y-%m-%d").strftime("%d-%m-%Y")
            normalized_items.append({
                "festival": festival,
                "date": normalized_date,
                "iso_date": iso_date,
            })

        grouped_by_date = {}
        for item in normalized_items:
            grouped_by_date.setdefault(item["iso_date"], []).append(item["festival"])

        sorted_items = []
        for iso_date, festivals in grouped_by_date.items():
            unique_festivals = list(dict.fromkeys([name.strip() for name in festivals if name and name.strip()]))
            combined_festival = " / ".join(unique_festivals) if unique_festivals else "Holiday"
            normalized_date = datetime.strptime(iso_date, "%Y-%m-%d").strftime("%d-%m-%Y")
            sorted_items.append({
                "festival": combined_festival,
                "date": normalized_date,
                "iso_date": iso_date,
            })

        sorted_items.sort(key=lambda item: item["iso_date"])

        keep_dates_by_year = {}
        for item in sorted_items:
            iso_date = item["iso_date"]
            item_year = iso_date[:4]
            keep_dates_by_year.setdefault(item_year, []).append(iso_date)

        for item_year, keep_dates in keep_dates_by_year.items():
            await holiday_events_collection.delete_many({
                "$and": [
                    {"date": {"$regex": f"^{item_year}-"}},
                    {"date": {"$nin": keep_dates}},
                ]
            })

        saved_count = 0
        for item in sorted_items:
            payload = {
                "title": item["festival"],
                "date": item["iso_date"],
                "source": "admin_upload",
                "created_by": current_user["id"],
                "created_at": datetime.utcnow().isoformat(),
            }
            result_update = await holiday_events_collection.update_one(
                {"date": item["iso_date"]},
                {"$set": payload},
                upsert=True,
            )
            if result_update.upserted_id or result_update.modified_count:
                saved_count += 1

        return {
            "items": sorted_items,
            "saved_count": saved_count,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/holiday/list")
async def get_holiday_list(year: str | None = None, current_user: dict = Depends(require_admin)):
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
