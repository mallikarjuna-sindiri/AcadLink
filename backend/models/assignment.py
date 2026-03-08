from pydantic import BaseModel
from typing import Optional


class AssignmentCreate(BaseModel):
    title: str
    description: str
    deadline: str   # ISO datetime string
    max_marks: int


class GradeSubmission(BaseModel):
    marks_obtained: int
    feedback: Optional[str] = None
