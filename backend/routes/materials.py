import os
import aiofiles
from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File, Form
from fastapi.responses import FileResponse
from utils.dependencies import require_teacher_or_admin, require_any
from config import materials_collection, subjects_collection, UPLOAD_DIR
from bson import ObjectId
from datetime import datetime

router = APIRouter(prefix="/api/subjects/{subject_id}/materials", tags=["Materials"])

ALLOWED_TYPES = {
    "application/pdf": "pdf",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "ppt",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "doc",
    "video/mp4": "video",
    "video/webm": "video",
    "video/avi": "video",
    "video/quicktime": "video",
}


def serialize_material(m: dict) -> dict:
    return {
        "id": str(m["_id"]),
        "subject_id": m.get("subject_id"),
        "title": m.get("title"),
        "content_type": m.get("content_type"),
        "file_name": m.get("file_name"),
        "file_size": m.get("file_size", 0),
        "uploaded_by": m.get("uploaded_by"),
        "uploaded_by_name": m.get("uploaded_by_name"),
        "uploaded_at": m.get("uploaded_at"),
    }


@router.post("/", status_code=status.HTTP_201_CREATED)
async def upload_material(
    subject_id: str,
    title: str = Form(...),
    file: UploadFile = File(...),
    current_user: dict = Depends(require_teacher_or_admin),
):
    """Teacher uploads a material file to a subject."""
    content_type = file.content_type or ""
    file_type = ALLOWED_TYPES.get(content_type)

    # Try by extension if MIME not matched
    if not file_type:
        ext = (file.filename or "").rsplit(".", 1)[-1].lower()
        ext_map = {"pdf": "pdf", "ppt": "ppt", "pptx": "ppt", "doc": "doc", "docx": "doc",
                   "mp4": "video", "webm": "video", "avi": "video", "mov": "video"}
        file_type = ext_map.get(ext)

    if not file_type:
        raise HTTPException(status_code=400, detail="Unsupported file type. Allow: PDF, PPT, DOC, Video")

    # Ensure directory exists
    dir_path = os.path.join(UPLOAD_DIR, subject_id)
    os.makedirs(dir_path, exist_ok=True)

    # Save file
    safe_name = f"{datetime.utcnow().timestamp()}_{file.filename}"
    file_path = os.path.join(dir_path, safe_name)
    content = await file.read()
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)

    material = {
        "subject_id": subject_id,
        "title": title,
        "content_type": file_type,
        "file_name": file.filename,
        "file_path": file_path,
        "file_size": len(content),
        "uploaded_by": current_user["id"],
        "uploaded_by_name": current_user["name"],
        "uploaded_at": datetime.utcnow().isoformat(),
    }
    result = await materials_collection.insert_one(material)
    return {"message": "Material uploaded", "material_id": str(result.inserted_id)}


@router.get("/")
async def list_materials(subject_id: str, current_user: dict = Depends(require_any)):
    items = await materials_collection.find({"subject_id": subject_id}).to_list(None)
    return [serialize_material(m) for m in items]


@router.get("/{material_id}/download")
async def download_material(
    subject_id: str,
    material_id: str,
    current_user: dict = Depends(require_any),
):
    try:
        m = await materials_collection.find_one({"_id": ObjectId(material_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid material ID")

    if not m:
        raise HTTPException(status_code=404, detail="Material not found")

    file_path = m.get("file_path", "")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on server")

    return FileResponse(
        path=file_path,
        filename=m.get("file_name", "file"),
        media_type="application/octet-stream",
    )


@router.delete("/{material_id}")
async def delete_material(
    subject_id: str,
    material_id: str,
    current_user: dict = Depends(require_teacher_or_admin),
):
    try:
        m = await materials_collection.find_one({"_id": ObjectId(material_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid material ID")

    if not m:
        raise HTTPException(status_code=404, detail="Material not found")

    # Remove physical file
    file_path = m.get("file_path", "")
    if os.path.exists(file_path):
        os.remove(file_path)

    await materials_collection.delete_one({"_id": ObjectId(material_id)})
    return {"message": "Material deleted"}
