from fastapi import APIRouter, Depends, Query
from utils.dependencies import require_any
from config import (
    db,
    subjects_collection,
    subject_members_collection,
    materials_collection,
    assignments_collection,
    mcq_tests_collection,
    chat_messages_collection,
)
from bson import ObjectId
from pymongo import UpdateOne

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])
user_notifications_collection = db["user_notifications"]


def normalize_subject_id(value) -> str:
    if value is None:
        return ""
    return str(value)


@router.get("/")
async def get_notifications(
    limit: int = Query(default=30, ge=1, le=100),
    since: str | None = Query(default=None),
    current_user: dict = Depends(require_any),
):
    role = current_user.get("role")
    subject_ids: list[str] = []
    membership_events = []

    def with_since_filter(query: dict, time_field: str) -> dict:
        if since:
            query[time_field] = {"$gte": since}
        return query

    if role == "student":
        scoped_memberships = await subject_members_collection.find({"student_id": current_user["id"]}, {"subject_id": 1}).to_list(None)
        subject_ids = [normalize_subject_id(m.get("subject_id")) for m in scoped_memberships if m.get("subject_id")]
        membership_events = await subject_members_collection.find(
            with_since_filter({"student_id": current_user["id"]}, "joined_at")
        ).to_list(None)
    elif role == "teacher":
        subjects = await subjects_collection.find({"teacher_id": current_user["id"]}, {"_id": 1}).to_list(None)
        subject_ids = [normalize_subject_id(s.get("_id")) for s in subjects]
        membership_query = with_since_filter({"subject_id": {"$in": subject_ids}}, "joined_at")
        membership_events = await subject_members_collection.find(membership_query).to_list(None) if subject_ids else []
    else:
        subjects = await subjects_collection.find({}, {"_id": 1}).to_list(None)
        subject_ids = [normalize_subject_id(s.get("_id")) for s in subjects]
        membership_query = with_since_filter({"subject_id": {"$in": subject_ids}}, "joined_at")
        membership_events = await subject_members_collection.find(membership_query).to_list(None) if subject_ids else []

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
        subject_docs = await subjects_collection.find({"_id": {"$in": subject_object_ids}}, {"name": 1, "teacher_name": 1, "created_at": 1}).to_list(None)
        subject_name_map = {str(s["_id"]): s.get("name", "Subject") for s in subject_docs}

    events = []
    source_limit = min(max(limit, 10), 60)

    subjects_query = {"_id": {"$in": subject_object_ids}}
    if since:
        subjects_query["created_at"] = {"$gte": since}

    subject_events = await subjects_collection.find(subjects_query, {"name": 1, "teacher_name": 1, "created_at": 1}).sort("created_at", -1).to_list(source_limit) if subject_object_ids else []
    for s in subject_events:
        sid = str(s.get("_id"))
        subject_name = s.get("name", "Subject")
        teacher_name = s.get("teacher_name", "Faculty")

        if role == "teacher":
            title = "Subject created"
            message = f"You created subject {subject_name}"
        elif role == "admin":
            title = "Subject created"
            message = f"{teacher_name} created subject {subject_name}"
        else:
            title = "Subject available"
            message = f"{subject_name} is available"

        events.append({
            "id": f"subject_{sid}",
            "type": "subject",
            "subject_id": sid,
            "subject_name": subject_name,
            "title": title,
            "message": message,
            "created_at": s.get("created_at", ""),
        })

    for m in membership_events:
        sid = normalize_subject_id(m.get("subject_id"))
        if not sid or sid not in subject_name_map:
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

    materials_query = with_since_filter({"subject_id": {"$in": subject_ids}}, "uploaded_at") if subject_ids else {}
    materials = await materials_collection.find(materials_query).sort("uploaded_at", -1).to_list(source_limit) if subject_ids else []
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

    assignments_query = with_since_filter({"subject_id": {"$in": subject_ids}}, "created_at") if subject_ids else {}
    assignments = await assignments_collection.find(assignments_query).sort("created_at", -1).to_list(source_limit) if subject_ids else []
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

    tests_query = with_since_filter({"subject_id": {"$in": subject_ids}}, "created_at") if subject_ids else {}
    tests = await mcq_tests_collection.find(tests_query).sort("created_at", -1).to_list(source_limit) if subject_ids else []
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

    if role != "admin":
        chat_query = {"subject_id": {"$in": subject_ids}} if subject_ids else {"subject_id": {"$in": []}}
        if since:
            chat_query["sent_at"] = {"$gte": since}
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
    scoped_events = events[:limit]

    viewer_id = current_user.get("id", "")
    if viewer_id:
        operations = []
        for event in scoped_events:
            viewer_event_id = f"{viewer_id}::{event['id']}"
            operations.append(
                UpdateOne(
                    {"_id": viewer_event_id},
                    {
                        "$set": {
                            "user_id": viewer_id,
                            **event,
                        }
                    },
                    upsert=True,
                )
            )

        if operations:
            await user_notifications_collection.bulk_write(operations, ordered=False)

        if since is None:
            if subject_ids:
                await user_notifications_collection.delete_many({
                    "user_id": viewer_id,
                    "type": {"$ne": "subject_deleted"},
                    "subject_id": {"$nin": subject_ids},
                })
            else:
                await user_notifications_collection.delete_many({
                    "user_id": viewer_id,
                    "type": {"$ne": "subject_deleted"},
                })

        if role == "admin":
            await user_notifications_collection.delete_many({
                "user_id": viewer_id,
                "type": "chat",
            })

        read_query = {"user_id": viewer_id}
        if since:
            read_query["created_at"] = {"$gte": since}

        items = await user_notifications_collection.find(read_query).sort("created_at", -1).to_list(limit)
        return [
            {
                "id": item.get("id"),
                "type": item.get("type"),
                "subject_id": item.get("subject_id"),
                "subject_name": item.get("subject_name"),
                "title": item.get("title"),
                "message": item.get("message"),
                "created_at": item.get("created_at"),
            }
            for item in items
        ]

    return []
