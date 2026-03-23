from datetime import datetime
from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from typing import Optional

from models.calendar import CalendarTaskCreate
from utils.dependencies import require_student, require_teacher
from config import (
    subject_members_collection,
    subjects_collection,
    assignments_collection,
    mcq_tests_collection,
    student_calendar_tasks_collection,
    teacher_calendar_tasks_collection,
    users_collection,
    holiday_events_collection,
)

router = APIRouter(prefix="/api/calendar", tags=["Calendar"])


def _safe_iso(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt.isoformat()
    except Exception:
        return None


async def _resolve_student_name(student_id: Optional[str]) -> Optional[str]:
    if not student_id:
        return None
    try:
        student_obj_id = ObjectId(student_id)
    except Exception:
        return None

    student = await users_collection.find_one({"_id": student_obj_id}, {"name": 1, "role": 1})
    if not student or student.get("role") != "student":
        return None
    return student.get("name") or "Student"


async def _teacher_student_ids(current_teacher_id: str):
    taught_subjects = await subjects_collection.find(
        {"teacher_id": current_teacher_id},
        {"_id": 1},
    ).to_list(None)
    taught_subject_ids = [str(item.get("_id")) for item in taught_subjects if item.get("_id")]
    if not taught_subject_ids:
        return set()

    memberships = await subject_members_collection.find(
        {"subject_id": {"$in": taught_subject_ids}},
        {"student_id": 1},
    ).to_list(None)
    return {member.get("student_id") for member in memberships if member.get("student_id")}


async def _validate_teacher_student_access(current_teacher_id: str, student_id: str) -> bool:
    allowed_student_ids = await _teacher_student_ids(current_teacher_id)
    return student_id in allowed_student_ids


@router.get("/student/events")
async def get_student_calendar_events(current_user: dict = Depends(require_student)):
    memberships = await subject_members_collection.find({"student_id": current_user["id"]}).to_list(None)
    subject_ids = [m.get("subject_id") for m in memberships if m.get("subject_id")]

    subject_docs = []
    if subject_ids:
        object_ids = []
        for sid in subject_ids:
            try:
                object_ids.append(ObjectId(sid))
            except Exception:
                continue
        if object_ids:
            subject_docs = await subjects_collection.find(
                {"_id": {"$in": object_ids}},
                {"name": 1, "subject_code": 1},
            ).to_list(None)

    subject_map = {
        str(subject["_id"]): {
            "name": subject.get("name", "Subject"),
            "code": subject.get("subject_code", ""),
        }
        for subject in subject_docs
    }

    faculty_events = []
    if subject_ids:
        assignments = await assignments_collection.find(
            {"subject_id": {"$in": subject_ids}, "deadline": {"$ne": None}}
        ).to_list(None)

        tests = await mcq_tests_collection.find(
            {"subject_id": {"$in": subject_ids}, "deadline": {"$ne": None}}
        ).to_list(None)

        for assignment in assignments:
            due_at = _safe_iso(assignment.get("deadline"))
            if not due_at:
                continue
            subject_meta = subject_map.get(assignment.get("subject_id", ""), {})
            faculty_events.append({
                "id": f"assignment-{assignment['_id']}",
                "title": assignment.get("title", "Assignment"),
                "type": "assignment",
                "source": "faculty",
                "subject_id": assignment.get("subject_id"),
                "subject_name": subject_meta.get("name", "Subject"),
                "subject_code": subject_meta.get("code", ""),
                "due_at": due_at,
                "description": assignment.get("description", ""),
            })

        for test in tests:
            due_at = _safe_iso(test.get("deadline"))
            if not due_at:
                continue
            subject_meta = subject_map.get(test.get("subject_id", ""), {})
            faculty_events.append({
                "id": f"test-{test['_id']}",
                "title": test.get("title", "Test"),
                "type": "test",
                "source": "faculty",
                "subject_id": test.get("subject_id"),
                "subject_name": subject_meta.get("name", "Subject"),
                "subject_code": subject_meta.get("code", ""),
                "due_at": due_at,
                "description": "",
            })

    personal_tasks = await student_calendar_tasks_collection.find(
        {"student_id": current_user["id"]}
    ).to_list(None)

    personal_events = []
    for task in personal_tasks:
        due_at = _safe_iso(task.get("due_at"))
        if not due_at:
            continue
        personal_events.append({
            "id": str(task["_id"]),
            "title": task.get("title", "Personal Task"),
            "type": "task",
            "source": "personal",
            "subject_id": None,
            "subject_name": None,
            "subject_code": None,
            "due_at": due_at,
            "start_at": task.get("start_at"),
            "end_at": task.get("end_at"),
            "all_day": bool(task.get("all_day", False)),
            "repeat": task.get("repeat", "none"),
            "deadline_at": task.get("deadline_at"),
            "description": task.get("description", ""),
        })

    assigned_tasks = await teacher_calendar_tasks_collection.find(
        {"assignee_student_id": current_user["id"]}
    ).to_list(None)

    assigned_events = []
    for task in assigned_tasks:
        due_at = _safe_iso(task.get("due_at"))
        if not due_at:
            continue

        assigned_events.append({
            "id": f"teacher-task-{task['_id']}",
            "title": task.get("title", "Faculty Task"),
            "type": "teacher_task",
            "source": "faculty",
            "subject_id": None,
            "subject_name": "Faculty",
            "subject_code": "",
            "due_at": due_at,
            "start_at": task.get("start_at"),
            "end_at": task.get("end_at"),
            "all_day": bool(task.get("all_day", False)),
            "repeat": task.get("repeat", "none"),
            "deadline_at": task.get("deadline_at"),
            "description": task.get("description", ""),
            "created_by": "faculty",
        })

    holiday_docs = await holiday_events_collection.find({}, {"title": 1, "date": 1}).to_list(None)
    holiday_events = []
    for holiday in holiday_docs:
        date_value = holiday.get("date")
        if not date_value:
            continue
        holiday_events.append({
            "id": f"holiday-{holiday['_id']}",
            "title": holiday.get("title", "Holiday"),
            "type": "holiday",
            "source": "holiday",
            "subject_id": None,
            "subject_name": None,
            "subject_code": None,
            "due_at": f"{date_value}T00:00:00",
            "start_at": f"{date_value}T00:00:00",
            "end_at": None,
            "all_day": True,
            "repeat": "none",
            "description": holiday.get("title", "Holiday"),
        })

    events = [*holiday_events, *faculty_events, *assigned_events, *personal_events]
    events.sort(key=lambda event: event.get("due_at") or "")
    return events


@router.post("/student/tasks", status_code=status.HTTP_201_CREATED)
async def create_student_calendar_task(
    body: CalendarTaskCreate,
    current_user: dict = Depends(require_student),
):
    title = (body.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")

    due_at = _safe_iso(body.due_at) or _safe_iso(body.start_at) or _safe_iso(body.deadline_at)
    if not due_at:
        raise HTTPException(status_code=400, detail="Invalid datetime payload")

    start_at = _safe_iso(body.start_at)
    end_at = _safe_iso(body.end_at)
    deadline_at = _safe_iso(body.deadline_at)

    task = {
        "student_id": current_user["id"],
        "title": title,
        "description": (body.description or "").strip(),
        "due_at": due_at,
        "start_at": start_at,
        "end_at": end_at,
        "all_day": bool(body.all_day),
        "repeat": (body.repeat or "none"),
        "deadline_at": deadline_at,
        "created_at": datetime.utcnow().isoformat(),
    }
    result = await student_calendar_tasks_collection.insert_one(task)

    return {
        "message": "Task created",
        "task": {
            "id": str(result.inserted_id),
            "title": task["title"],
            "description": task["description"],
            "due_at": task["due_at"],
            "start_at": task["start_at"],
            "end_at": task["end_at"],
            "all_day": task["all_day"],
            "repeat": task["repeat"],
            "deadline_at": task["deadline_at"],
            "type": "task",
            "source": "personal",
        },
    }


@router.delete("/student/tasks/{task_id}")
async def delete_student_calendar_task(
    task_id: str,
    current_user: dict = Depends(require_student),
):
    try:
        task_obj_id = ObjectId(task_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid task id")

    result = await student_calendar_tasks_collection.delete_one(
        {"_id": task_obj_id, "student_id": current_user["id"]}
    )

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")

    return {"message": "Task deleted", "task_id": task_id}


@router.put("/student/tasks/{task_id}")
async def update_student_calendar_task(
    task_id: str,
    body: CalendarTaskCreate,
    current_user: dict = Depends(require_student),
):
    try:
        task_obj_id = ObjectId(task_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid task id")

    title = (body.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")

    due_at = _safe_iso(body.due_at) or _safe_iso(body.start_at) or _safe_iso(body.deadline_at)
    if not due_at:
        raise HTTPException(status_code=400, detail="Invalid datetime payload")

    start_at = _safe_iso(body.start_at)
    end_at = _safe_iso(body.end_at)
    deadline_at = _safe_iso(body.deadline_at)

    update_payload = {
        "title": title,
        "description": (body.description or "").strip(),
        "due_at": due_at,
        "start_at": start_at,
        "end_at": end_at,
        "all_day": bool(body.all_day),
        "repeat": (body.repeat or "none"),
        "deadline_at": deadline_at,
        "updated_at": datetime.utcnow().isoformat(),
    }

    result = await student_calendar_tasks_collection.update_one(
        {"_id": task_obj_id, "student_id": current_user["id"]},
        {"$set": update_payload},
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")

    return {
        "message": "Task updated",
        "task": {
            "id": task_id,
            "title": update_payload["title"],
            "description": update_payload["description"],
            "due_at": update_payload["due_at"],
            "start_at": update_payload["start_at"],
            "end_at": update_payload["end_at"],
            "all_day": update_payload["all_day"],
            "repeat": update_payload["repeat"],
            "deadline_at": update_payload["deadline_at"],
            "type": "task",
            "source": "personal",
        },
    }


@router.get("/teacher/students")
async def get_teacher_students(current_user: dict = Depends(require_teacher)):
    student_ids = await _teacher_student_ids(current_user["id"])
    if not student_ids:
        return []

    student_object_ids = []
    for student_id in student_ids:
        try:
            student_object_ids.append(ObjectId(student_id))
        except Exception:
            continue

    if not student_object_ids:
        return []

    student_docs = await users_collection.find(
        {"_id": {"$in": student_object_ids}, "role": "student"},
        {"name": 1, "email": 1},
    ).to_list(None)

    students = [
        {
            "id": str(student["_id"]),
            "name": student.get("name", "Student"),
            "email": student.get("email", ""),
        }
        for student in student_docs
    ]
    students.sort(key=lambda item: item.get("name", ""))
    return students


@router.get("/teacher/events")
async def get_teacher_calendar_events(current_user: dict = Depends(require_teacher)):
    tasks = await teacher_calendar_tasks_collection.find(
        {"teacher_id": current_user["id"]}
    ).to_list(None)

    events = []
    for task in tasks:
        due_at = _safe_iso(task.get("due_at"))
        if not due_at:
            continue

        events.append({
            "id": str(task["_id"]),
            "title": task.get("title", "Task"),
            "type": "task",
            "source": "personal",
            "scope": "assigned" if task.get("assignee_student_id") else "own",
            "assignee_student_id": task.get("assignee_student_id"),
            "assignee_student_name": task.get("assignee_student_name"),
            "subject_id": None,
            "subject_name": None,
            "subject_code": None,
            "due_at": due_at,
            "start_at": task.get("start_at"),
            "end_at": task.get("end_at"),
            "all_day": bool(task.get("all_day", False)),
            "repeat": task.get("repeat", "none"),
            "deadline_at": task.get("deadline_at"),
            "description": task.get("description", ""),
        })

    holiday_docs = await holiday_events_collection.find({}, {"title": 1, "date": 1}).to_list(None)
    holiday_events = []
    for holiday in holiday_docs:
        date_value = holiday.get("date")
        if not date_value:
            continue
        holiday_events.append({
            "id": f"holiday-{holiday['_id']}",
            "title": holiday.get("title", "Holiday"),
            "type": "holiday",
            "source": "holiday",
            "subject_id": None,
            "subject_name": None,
            "subject_code": None,
            "due_at": f"{date_value}T00:00:00",
            "start_at": f"{date_value}T00:00:00",
            "end_at": None,
            "all_day": True,
            "repeat": "none",
            "description": holiday.get("title", "Holiday"),
        })

    full_events = [*holiday_events, *events]
    full_events.sort(key=lambda event: event.get("due_at") or "")
    return full_events


@router.post("/teacher/tasks", status_code=status.HTTP_201_CREATED)
async def create_teacher_calendar_task(
    body: CalendarTaskCreate,
    current_user: dict = Depends(require_teacher),
):
    title = (body.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")

    due_at = _safe_iso(body.due_at) or _safe_iso(body.start_at) or _safe_iso(body.deadline_at)
    if not due_at:
        raise HTTPException(status_code=400, detail="Invalid datetime payload")

    assignee_student_id = (body.assignee_student_id or "").strip() or None
    assignee_student_name = None
    if assignee_student_id:
        can_assign = await _validate_teacher_student_access(current_user["id"], assignee_student_id)
        if not can_assign:
            raise HTTPException(status_code=403, detail="You can assign tasks only to your students")

        assignee_student_name = await _resolve_student_name(assignee_student_id)
        if not assignee_student_name:
            raise HTTPException(status_code=400, detail="Invalid student selected")

    task = {
        "teacher_id": current_user["id"],
        "assignee_student_id": assignee_student_id,
        "assignee_student_name": assignee_student_name,
        "title": title,
        "description": (body.description or "").strip(),
        "due_at": due_at,
        "start_at": _safe_iso(body.start_at),
        "end_at": _safe_iso(body.end_at),
        "all_day": bool(body.all_day),
        "repeat": (body.repeat or "none"),
        "deadline_at": _safe_iso(body.deadline_at),
        "created_at": datetime.utcnow().isoformat(),
    }
    result = await teacher_calendar_tasks_collection.insert_one(task)

    return {
        "message": "Task created",
        "task": {
            "id": str(result.inserted_id),
            "title": task["title"],
            "description": task["description"],
            "due_at": task["due_at"],
            "start_at": task["start_at"],
            "end_at": task["end_at"],
            "all_day": task["all_day"],
            "repeat": task["repeat"],
            "deadline_at": task["deadline_at"],
            "assignee_student_id": task["assignee_student_id"],
            "assignee_student_name": task["assignee_student_name"],
            "type": "task",
            "source": "personal",
        },
    }


@router.put("/teacher/tasks/{task_id}")
async def update_teacher_calendar_task(
    task_id: str,
    body: CalendarTaskCreate,
    current_user: dict = Depends(require_teacher),
):
    try:
        task_obj_id = ObjectId(task_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid task id")

    title = (body.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")

    due_at = _safe_iso(body.due_at) or _safe_iso(body.start_at) or _safe_iso(body.deadline_at)
    if not due_at:
        raise HTTPException(status_code=400, detail="Invalid datetime payload")

    assignee_student_id = (body.assignee_student_id or "").strip() or None
    assignee_student_name = None
    if assignee_student_id:
        can_assign = await _validate_teacher_student_access(current_user["id"], assignee_student_id)
        if not can_assign:
            raise HTTPException(status_code=403, detail="You can assign tasks only to your students")

        assignee_student_name = await _resolve_student_name(assignee_student_id)
        if not assignee_student_name:
            raise HTTPException(status_code=400, detail="Invalid student selected")

    update_payload = {
        "title": title,
        "description": (body.description or "").strip(),
        "due_at": due_at,
        "start_at": _safe_iso(body.start_at),
        "end_at": _safe_iso(body.end_at),
        "all_day": bool(body.all_day),
        "repeat": (body.repeat or "none"),
        "deadline_at": _safe_iso(body.deadline_at),
        "assignee_student_id": assignee_student_id,
        "assignee_student_name": assignee_student_name,
        "updated_at": datetime.utcnow().isoformat(),
    }

    result = await teacher_calendar_tasks_collection.update_one(
        {"_id": task_obj_id, "teacher_id": current_user["id"]},
        {"$set": update_payload},
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")

    return {
        "message": "Task updated",
        "task": {
            "id": task_id,
            "title": update_payload["title"],
            "description": update_payload["description"],
            "due_at": update_payload["due_at"],
            "start_at": update_payload["start_at"],
            "end_at": update_payload["end_at"],
            "all_day": update_payload["all_day"],
            "repeat": update_payload["repeat"],
            "deadline_at": update_payload["deadline_at"],
            "assignee_student_id": update_payload["assignee_student_id"],
            "assignee_student_name": update_payload["assignee_student_name"],
            "type": "task",
            "source": "personal",
        },
    }


@router.delete("/teacher/tasks/{task_id}")
async def delete_teacher_calendar_task(
    task_id: str,
    current_user: dict = Depends(require_teacher),
):
    try:
        task_obj_id = ObjectId(task_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid task id")

    result = await teacher_calendar_tasks_collection.delete_one(
        {"_id": task_obj_id, "teacher_id": current_user["id"]}
    )

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")

    return {"message": "Task deleted", "task_id": task_id}
