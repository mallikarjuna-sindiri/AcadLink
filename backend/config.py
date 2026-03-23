import os
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()


def _as_bool(value: str, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "acadlink")
MONGO_SERVER_SELECTION_TIMEOUT_MS = int(os.getenv("MONGO_SERVER_SELECTION_TIMEOUT_MS", "5000"))
DEV_MODE = _as_bool(os.getenv("DEV_MODE"), default=False)
JWT_SECRET = os.getenv("JWT_SECRET", "").strip()
if not JWT_SECRET:
    if DEV_MODE:
        JWT_SECRET = "dev-insecure-secret-change-me"
    else:
        raise RuntimeError("JWT_SECRET is required when DEV_MODE is false.")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRY_HOURS = int(os.getenv("JWT_EXPIRY_HOURS", "48"))
COLLEGE_EMAIL_DOMAIN = os.getenv("COLLEGE_EMAIL_DOMAIN", "vnrvjiet.in")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@vnrvjiet.in")

cors_origins_env = os.getenv(
	"CORS_ALLOW_ORIGINS",
	"http://localhost:5173,http://127.0.0.1:5173"
)
CORS_ALLOW_ORIGINS = [origin.strip() for origin in cors_origins_env.split(",") if origin.strip()]

# MongoDB Client
client = AsyncIOMotorClient(
	MONGO_URI,
	serverSelectionTimeoutMS=MONGO_SERVER_SELECTION_TIMEOUT_MS,
)
db = client[DATABASE_NAME]

# Collections
users_collection = db["users"]
subjects_collection = db["subjects"]
subject_members_collection = db["subject_members"]
materials_collection = db["materials"]
assignments_collection = db["assignments"]
submissions_collection = db["submissions"]
mcq_tests_collection = db["mcq_tests"]
mcq_attempts_collection = db["mcq_attempts"]
chat_messages_collection = db["chat_messages"]
content_collection = db["content"]
student_calendar_tasks_collection = db["student_calendar_tasks"]
teacher_calendar_tasks_collection = db["teacher_calendar_tasks"]
holiday_events_collection = db["holiday_events"]
