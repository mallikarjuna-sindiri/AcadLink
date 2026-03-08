"""
AcadLink Seed Script — creates admin + dev test accounts.

Usage:
    cd backend
    ./venv/bin/python seed.py
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
from dotenv import load_dotenv
import os

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "acadlink")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "mallikarjuna.sindiri@gmail.com")


async def upsert_user(users, email, name, role):
    existing = await users.find_one({"email": email})
    if existing:
        await users.update_one({"email": email}, {"$set": {"role": role, "is_active": True}})
        print(f"   Updated  [{role:8s}] {email}")
    else:
        await users.insert_one({
            "name": name, "email": email, "google_id": None,
            "picture": "", "role": role, "is_active": True,
            "created_by": None, "created_at": datetime.utcnow().isoformat(),
        })
        print(f"   Created  [{role:8s}] {email}")


async def seed():
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DATABASE_NAME]
    users = db["users"]

    print("🌱 Seeding AcadLink users...\n")
    await upsert_user(users, ADMIN_EMAIL.lower(), "Mallikarjuna Sindiri", "admin")
    await upsert_user(users, "devteacher@vnrvjiet.in", "Dev Teacher", "teacher")
    await upsert_user(users, "devstudent@vnrvjiet.in", "Dev Student", "student")

    print("\n✅ Done! Use the 'Quick Dev Login' buttons on the frontend to test.")
    print(f"   Admin email: {ADMIN_EMAIL}")
    client.close()


asyncio.run(seed())
