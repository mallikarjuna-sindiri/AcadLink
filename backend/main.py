import os
import secrets
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
from fastapi.openapi.utils import get_openapi
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from routes import auth, admin, subjects, materials, assignments, mcq, chat
from config import UPLOAD_DIR, chat_messages_collection

security = HTTPBasic()

def get_current_username(credentials: HTTPBasicCredentials = Depends(security)):
    correct_username = secrets.compare_digest(credentials.username, os.getenv("SWAGGER_USER", "root"))
    correct_password = secrets.compare_digest(credentials.password, os.getenv("SWAGGER_PASSWORD", "admin"))
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
    await chat_messages_collection.create_index([
        ("subject_id", 1),
        ("sent_at", -1),
    ])

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
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure uploads directory exists
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Register routers
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(subjects.router)
app.include_router(materials.router)
app.include_router(assignments.router)
app.include_router(mcq.router)
app.include_router(chat.router)


@app.get("/")
async def root():
    return {"message": "AcadLink API v2.0 is running 🚀", "docs": "/docs"}


@app.get("/health")
async def health():
    return {"status": "ok", "service": "AcadLink"}
