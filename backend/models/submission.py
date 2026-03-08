from pydantic import BaseModel, Field
from typing import Optional


class SubmissionCreate(BaseModel):
    content_id: str
    answer: str = Field(..., min_length=5)


class SubmissionOut(BaseModel):
    id: str
    content_id: str
    student_id: str
    student_name: Optional[str] = None
    answer: str
    submitted_at: Optional[str] = None
