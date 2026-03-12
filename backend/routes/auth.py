from fastapi import APIRouter, HTTPException, status
from models.user import GoogleAuthRequest
from utils.auth import create_access_token
from config import (
    users_collection, COLLEGE_EMAIL_DOMAIN,
    GOOGLE_CLIENT_ID, ADMIN_EMAIL
)
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from datetime import datetime
from bson import ObjectId
import os

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

DEV_MODE = os.getenv("DEV_MODE", "false").lower() == "true"
ADMIN_GMAIL = ADMIN_EMAIL.lower().strip()


@router.post("/google")
async def google_login(body: GoogleAuthRequest):
    """Verify Google OAuth token and login/auto-register user."""
    # ── 1. Verify Google token ──────────────────────────────────
    try:
        idinfo = id_token.verify_oauth2_token(
            body.credential,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Google token: {exc}",
        )

    email = idinfo.get("email", "").lower().strip()
    name = idinfo.get("name", email.split("@")[0])
    picture = (idinfo.get("picture") or "").strip()
    google_id = idinfo.get("sub", "")

    # ── 2. Domain check ─────────────────────────────────────────
    # Admin gmail is allowed; all others must be @vnrvjiet.in
    is_admin_gmail = email == ADMIN_GMAIL
    is_college_email = email.endswith(f"@{COLLEGE_EMAIL_DOMAIN}")

    if not is_admin_gmail and not is_college_email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Only @{COLLEGE_EMAIL_DOMAIN} emails (or admin Gmail) are allowed.",
        )

    # ── 3. Fetch / create user ──────────────────────────────────
    user = await users_collection.find_one({"email": email})

    if not user:
        # Determine role: admin if matches ADMIN_EMAIL, else student
        role = "admin" if is_admin_gmail else "student"
        new_user = {
            "name": name,
            "email": email,
            "google_id": google_id,
            "picture": picture,
            "role": role,
            "is_active": True,
            "created_at": datetime.utcnow().isoformat(),
            "created_by": None,
        }
        result = await users_collection.insert_one(new_user)
        user = await users_collection.find_one({"_id": result.inserted_id})
    else:
        # Refresh Google profile info
        updates = {"name": name, "google_id": google_id}
        if picture:
            updates["picture"] = picture

        await users_collection.update_one(
            {"email": email},
            {"$set": updates},
        )
        user = await users_collection.find_one({"email": email})

    # ── 4. Active check ─────────────────────────────────────────
    if not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated. Contact admin.",
        )

    # ── 5. Issue JWT ────────────────────────────────────────────
    token = create_access_token(
        {"user_id": str(user["_id"]), "role": user["role"]}
    )

    return {
        "token": token,
        "user": {
            "id": str(user["_id"]),
            "name": user["name"],
            "email": user["email"],
            "role": user["role"],
            "picture": picture or user.get("picture", ""),
        },
    }


@router.post("/dev-login")
async def dev_login(body: dict):
    """
    DEV ONLY — bypass Google OAuth for local testing.
    Body: { "role": "admin" | "teacher" | "student" }
    """
    if not DEV_MODE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Dev login is disabled.")

    role = body.get("role", "student")
    if role not in ("admin", "teacher", "student"):
        raise HTTPException(status_code=400, detail="Invalid role")

    # Role → test email mapping
    email_map = {
        "admin": ADMIN_GMAIL or "mallikarjuna.sindiri@gmail.com",
        "teacher": "devteacher@vnrvjiet.in",
        "student": "devstudent@vnrvjiet.in",
    }
    name_map = {
        "admin": "Dev Admin",
        "teacher": "Dev Teacher",
        "student": "Dev Student",
    }

    email = email_map[role]
    name = name_map[role]

    user = await users_collection.find_one({"email": email})
    if not user:
        result = await users_collection.insert_one({
            "name": name,
            "email": email,
            "google_id": f"dev_{role}",
            "picture": "",
            "role": role,
            "is_active": True,
            "created_at": datetime.utcnow().isoformat(),
            "created_by": "dev",
        })
        user = await users_collection.find_one({"_id": result.inserted_id})

    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account deactivated.")

    token = create_access_token({"user_id": str(user["_id"]), "role": user["role"]})

    return {
        "token": token,
        "user": {
            "id": str(user["_id"]),
            "name": user["name"],
            "email": user["email"],
            "role": user["role"],
            "picture": user.get("picture", ""),
        },
    }


@router.get("/me")
async def get_me():
    """Health-check placeholder — real /me uses JWT dependency."""
    return {"message": "Use Authorization header with Bearer token"}
