from fastapi import APIRouter, Depends, HTTPException, Query
from models.chat import ChatMessageCreate
from utils.dependencies import require_any
from config import chat_messages_collection
from datetime import datetime, timezone

router = APIRouter(prefix="/api/subjects/{subject_id}/chat", tags=["Chat"])


# ── Get messages ─────────────────────────────────────────────────────────────
@router.get("/")
async def get_messages(
    subject_id: str,
    since: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=200),
    current_user: dict = Depends(require_any),
):
    query = {"subject_id": subject_id}
    if since:
        query["sent_at"] = {"$gt": since}

    messages = (
        await chat_messages_collection
        .find(query)
        .sort("sent_at", -1)
        .to_list(limit)
    )

    messages.reverse()

    return [
        {
            "id": str(m["_id"]),
            "subject_id": m.get("subject_id"),
            "sender_id": m.get("sender_id"),
            "sender_name": m.get("sender_name"),
            "sender_role": m.get("sender_role"),
            "sender_picture": m.get("sender_picture", ""),
            "message": m.get("message"),
            "sent_at": m.get("sent_at"),
        }
        for m in messages
    ]


# ── Send message ─────────────────────────────────────────────────────────────
@router.post("/")
async def send_message(
    subject_id: str,
    body: ChatMessageCreate,
    current_user: dict = Depends(require_any),
):
    clean_message = body.message.strip()
    if not clean_message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    msg = {
        "subject_id": subject_id,
        "sender_id": current_user["id"],
        "sender_name": current_user["name"],
        "sender_role": current_user["role"],
        "sender_picture": current_user.get("picture", ""),
        "message": clean_message,
        "sent_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await chat_messages_collection.insert_one(msg)
    return {
        "id": str(result.inserted_id),
        **msg,
    }
