import os
import secrets
import logging
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
from fastapi.openapi.utils import get_openapi
from fastapi.middleware.cors import CORSMiddleware
from routes import auth, admin, teacher, subjects, materials, assignments, mcq, chat, notifications, calendar
from config import UPLOAD_DIR, chat_messages_collection, CORS_ALLOW_ORIGINS, db

security = HTTPBasic()
logger = logging.getLogger(__name__)

def get_current_username(credentials: HTTPBasicCredentials = Depends(security)):
    swagger_user = os.getenv("SWAGGER_USER", "root")
    swagger_password = os.getenv("SWAGGER_PASSWORD", "admin")
    if swagger_password == "admin":
        logger.warning("SWAGGER_PASSWORD is using default value. Change this in production.")

    correct_username = secrets.compare_digest(credentials.username, swagger_user)
    correct_password = secrets.compare_digest(credentials.password, swagger_password)
    if not (correct_username and correct_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username

app = FastAPI(
    title="AcadLink API",
    description="Learning Management System for VNR VJIET",
    version="2.0.0",
    docs_url=None, 
    redoc_url=None, 
    openapi_url=None,
)


@app.on_event("startup")
async def create_indexes():
    try:
        await db.command("ping")
    except Exception as exc:
        logger.warning("MongoDB ping failed at startup: %s", exc)

    try:
        await chat_messages_collection.create_index([
            ("subject_id", 1),
            ("sent_at", -1),
        ])
    except Exception as exc:
        logger.warning("Failed to create chat index: %s", exc)

    try:
        await db["user_notifications"].create_index([
            ("user_id", 1),
            ("created_at", -1),
        ])
    except Exception as exc:
        logger.warning("Failed to create user notifications index: %s", exc)

    try:
        await db["student_calendar_tasks"].create_index([
            ("student_id", 1),
            ("due_at", 1),
        ])
    except Exception as exc:
        logger.warning("Failed to create student calendar tasks index: %s", exc)

    try:
        await db["teacher_calendar_tasks"].create_index([
            ("teacher_id", 1),
            ("due_at", 1),
        ])
        await db["teacher_calendar_tasks"].create_index([
            ("assignee_student_id", 1),
            ("due_at", 1),
        ])
    except Exception as exc:
        logger.warning("Failed to create teacher calendar tasks index: %s", exc)

    try:
        await db["holiday_events"].create_index([
            ("date", 1),
        ], unique=True)
    except Exception as exc:
        logger.warning("Failed to create holiday events index: %s", exc)

# --- Secured Documentation Routes ---
@app.get("/docs", include_in_schema=False)
async def get_swagger_documentation(username: str = Depends(get_current_username)):
    return get_swagger_ui_html(openapi_url="/openapi.json", title="docs")

@app.get("/redoc", include_in_schema=False)
async def get_redoc_documentation(username: str = Depends(get_current_username)):
    return get_redoc_html(openapi_url="/openapi.json", title="docs")

@app.get("/openapi.json", include_in_schema=False)
async def openapi(username: str = Depends(get_current_username)):
    return get_openapi(title=app.title, version=app.version, routes=app.routes)

# CORS — allow React dev server and network devices
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure uploads directory exists
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Register routers
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(teacher.router)
app.include_router(subjects.router)
app.include_router(materials.router)
app.include_router(assignments.router)
app.include_router(mcq.router)
app.include_router(chat.router)
app.include_router(notifications.router)
app.include_router(calendar.router)


@app.get("/")
async def root():
    return {"message": "AcadLink API v2.0 is running 🚀", "docs": "/docs"}


@app.get("/health")
async def health():
    return {"status": "ok", "service": "AcadLink"}
