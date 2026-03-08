from pydantic import BaseModel
from typing import Optional


class SubjectCreate(BaseModel):
    name: str
    year: str        # BTech-I, BTech-II, BTech-III, BTech-IV
    semester: str    # I, II
    branch: str      # CSE, CSBS


class SubjectOut(BaseModel):
    id: str
    name: str
    year: str
    semester: str
    branch: str
    subject_code: str
    teacher_id: str
    teacher_name: str
    teacher_picture: Optional[str] = None
    student_count: Optional[int] = 0
    created_at: str
