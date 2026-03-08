import os
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "acadlink")
JWT_SECRET = os.getenv("JWT_SECRET", "change_this_secret")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRY_HOURS = int(os.getenv("JWT_EXPIRY_HOURS", "48"))
COLLEGE_EMAIL_DOMAIN = os.getenv("COLLEGE_EMAIL_DOMAIN", "vnrvjiet.in")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@vnrvjiet.in")

# MongoDB Client
client = AsyncIOMotorClient(MONGO_URI)
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
