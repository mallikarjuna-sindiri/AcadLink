from pydantic import BaseModel, Field
from typing import Optional


class ContentCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    description: str = Field(..., min_length=5)
    content_type: str = Field(default="notes", pattern="^(notes|assignment)$")


class ContentOut(BaseModel):
    id: str
    title: str
    description: str
    content_type: str
    teacher_id: str
    teacher_name: Optional[str] = None
    created_at: Optional[str] = None
