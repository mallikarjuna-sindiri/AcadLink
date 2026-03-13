from fastapi import APIRouter, Depends, Query
from utils.dependencies import require_any
from config import (
    subjects_collection,
    subject_members_collection,
    materials_collection,
    assignments_collection,
    mcq_tests_collection,
    chat_messages_collection,
)
from bson import ObjectId

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


def normalize_subject_id(value) -> str:
    if value is None:
        return ""
    return str(value)


@router.get("/")
async def get_notifications(
    limit: int = Query(default=30, ge=1, le=100),
    current_user: dict = Depends(require_any),
):
    role = current_user.get("role")
    subject_ids: list[str] = []
    membership_events = []

    if role == "student":
        memberships = await subject_members_collection.find({"student_id": current_user["id"]}).to_list(None)
        subject_ids = [normalize_subject_id(m.get("subject_id")) for m in memberships if m.get("subject_id")]
        membership_events = memberships
    elif role == "teacher":
        subjects = await subjects_collection.find({"teacher_id": current_user["id"]}, {"_id": 1}).to_list(None)
        subject_ids = [normalize_subject_id(s.get("_id")) for s in subjects]
        membership_events = await subject_members_collection.find({"subject_id": {"$in": subject_ids}}).to_list(None) if subject_ids else []
    else:
        subjects = await subjects_collection.find({}, {"_id": 1}).to_list(None)
        subject_ids = [normalize_subject_id(s.get("_id")) for s in subjects]
        membership_events = await subject_members_collection.find({"subject_id": {"$in": subject_ids}}).to_list(None) if subject_ids else []

    subject_ids = list(dict.fromkeys([sid for sid in subject_ids if sid]))

    if not subject_ids and role != "student":
        return []

    subject_name_map = {}
    subject_object_ids = []
    for sid in subject_ids:
        try:
            subject_object_ids.append(ObjectId(sid))
        except Exception:
            continue

    if subject_object_ids:
        subject_docs = await subjects_collection.find({"_id": {"$in": subject_object_ids}}, {"name": 1}).to_list(None)
        subject_name_map = {str(s["_id"]): s.get("name", "Subject") for s in subject_docs}

    events = []

    for m in membership_events:
        sid = normalize_subject_id(m.get("subject_id"))
        if not sid:
            continue
        if role == "student":
            title = "Joined subject"
            message = f"You joined {subject_name_map.get(sid, 'a subject')}"
        else:
            title = "Student joined"
            student_name = m.get("student_name", "A student")
            message = f"{student_name} joined {subject_name_map.get(sid, 'a subject')}"

        events.append({
            "id": f"join_{sid}_{m.get('student_id', '')}_{m.get('joined_at', '')}",
            "type": "join",
            "subject_id": sid,
            "subject_name": subject_name_map.get(sid, "Subject"),
            "title": title,
            "message": message,
            "created_at": m.get("joined_at", ""),
        })

    source_limit = min(max(limit, 10), 60)

    materials = await materials_collection.find({"subject_id": {"$in": subject_ids}}).sort("uploaded_at", -1).to_list(source_limit) if subject_ids else []
    for item in materials:
        sid = normalize_subject_id(item.get("subject_id"))
        events.append({
            "id": f"material_{str(item['_id'])}",
            "type": "material",
            "subject_id": sid,
            "subject_name": subject_name_map.get(sid, "Subject"),
            "title": "New material uploaded",
            "message": f"{item.get('title', 'Material')} in {subject_name_map.get(sid, 'a subject')}",
            "created_at": item.get("uploaded_at", ""),
        })

    assignments = await assignments_collection.find({"subject_id": {"$in": subject_ids}}).sort("created_at", -1).to_list(source_limit) if subject_ids else []
    for item in assignments:
        sid = normalize_subject_id(item.get("subject_id"))
        events.append({
            "id": f"assignment_{str(item['_id'])}",
            "type": "assignment",
            "subject_id": sid,
            "subject_name": subject_name_map.get(sid, "Subject"),
            "title": "New assignment",
            "message": f"{item.get('title', 'Assignment')} posted in {subject_name_map.get(sid, 'a subject')}",
            "created_at": item.get("created_at", ""),
        })

    tests = await mcq_tests_collection.find({"subject_id": {"$in": subject_ids}}).sort("created_at", -1).to_list(source_limit) if subject_ids else []
    for item in tests:
        sid = normalize_subject_id(item.get("subject_id"))
        events.append({
            "id": f"test_{str(item['_id'])}",
            "type": "test",
            "subject_id": sid,
            "subject_name": subject_name_map.get(sid, "Subject"),
            "title": "New test",
            "message": f"{item.get('title', 'MCQ Test')} added in {subject_name_map.get(sid, 'a subject')}",
            "created_at": item.get("created_at", ""),
        })

    chat_query = {"subject_id": {"$in": subject_ids}} if subject_ids else {"subject_id": {"$in": []}}
    if role in ("student", "teacher"):
        chat_query["sender_id"] = {"$ne": current_user["id"]}

    chat_items = await chat_messages_collection.find(chat_query).sort("sent_at", -1).to_list(source_limit) if subject_ids else []
    for item in chat_items:
        sid = normalize_subject_id(item.get("subject_id"))
        events.append({
            "id": f"chat_{str(item['_id'])}",
            "type": "chat",
            "subject_id": sid,
            "subject_name": subject_name_map.get(sid, "Subject"),
            "title": "New chat message",
            "message": f"{item.get('sender_name', 'Someone')}: {item.get('message', '')[:50]}",
            "created_at": item.get("sent_at", ""),
        })

    events.sort(key=lambda e: e.get("created_at") or "", reverse=True)
    return events[:limit]
