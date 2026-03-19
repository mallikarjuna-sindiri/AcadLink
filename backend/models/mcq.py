from pydantic import BaseModel
from typing import List, Optional


class MCQOption(BaseModel):
    text: str


class MCQQuestion(BaseModel):
    question_text: str
    options: List[str]   # exactly 4 options
    correct_answer: int  # index 0-3


class MCQTestCreate(BaseModel):
    title: str
    time_limit_minutes: int
    deadline: Optional[str] = None
    questions: List[MCQQuestion]


class MCQAttemptSubmit(BaseModel):
    answers: List[int]  # student's selected option indices
