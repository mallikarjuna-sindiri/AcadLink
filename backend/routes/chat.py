from fastapi import APIRouter, Depends
from models.chat import ChatMessageCreate
from utils.dependencies import require_any
from config import chat_messages_collection
from datetime import datetime

router = APIRouter(prefix="/api/subjects/{subject_id}/chat", tags=["Chat"])


# ── Get messages ─────────────────────────────────────────────────────────────
@router.get("/")
async def get_messages(
    subject_id: str,
    current_user: dict = Depends(require_any),
):
    messages = (
        await chat_messages_collection
        .find({"subject_id": subject_id})
        .sort("sent_at", 1)
        .to_list(200)  # last 200 messages
    )
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
    msg = {
        "subject_id": subject_id,
        "sender_id": current_user["id"],
        "sender_name": current_user["name"],
        "sender_role": current_user["role"],
        "sender_picture": current_user.get("picture", ""),
        "message": body.message.strip(),
        "sent_at": datetime.utcnow().isoformat(),
    }
    result = await chat_messages_collection.insert_one(msg)
    return {
        "id": str(result.inserted_id),
        **msg,
    }
