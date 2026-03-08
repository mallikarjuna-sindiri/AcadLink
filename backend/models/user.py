from pydantic import BaseModel, EmailStr
from typing import Optional


class GoogleAuthRequest(BaseModel):
    credential: str  # Google ID token


class TeacherCreate(BaseModel):
    name: str
    email: EmailStr


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    role: str
    picture: Optional[str] = None
    is_active: Optional[bool] = True
    created_at: Optional[str] = None
    created_by: Optional[str] = None
