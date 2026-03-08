from pydantic import BaseModel


class ChatMessageCreate(BaseModel):
    message: str
