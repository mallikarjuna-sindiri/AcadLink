from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from utils.auth import decode_token
from config import users_collection
from bson import ObjectId

security = HTTPBearer()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    payload = decode_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    if not user.get("is_active", True):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account deactivated")

    return {
        "id": str(user["_id"]),
        "name": user.get("name"),
        "email": user.get("email"),
        "role": user.get("role"),
        "picture": user.get("picture", ""),
    }


async def require_admin(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admins only")
    return current_user


async def require_teacher(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "teacher":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Faculty only")
    return current_user


async def require_teacher_or_admin(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ("admin", "teacher"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Faculty or Admins only")
    return current_user


async def require_student(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "student":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Students only")
    return current_user


async def require_any(current_user: dict = Depends(get_current_user)):
    """Any authenticated and active user."""
    return current_user
