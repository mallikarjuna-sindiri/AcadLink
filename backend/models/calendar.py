from pydantic import BaseModel
from typing import Optional


class CalendarTaskCreate(BaseModel):
    title: str
    due_at: Optional[str] = None
    start_at: Optional[str] = None
    end_at: Optional[str] = None
    all_day: bool = False
    repeat: Optional[str] = "none"
    deadline_at: Optional[str] = None
    description: Optional[str] = ""
    assignee_student_id: Optional[str] = None
