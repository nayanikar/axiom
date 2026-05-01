from fastapi import APIRouter

from ..schemas import TeacherInfo
from ..teachers import teacher_meta

router = APIRouter(prefix="/api/teachers", tags=["teachers"])


@router.get("", response_model=list[TeacherInfo])
async def list_teachers() -> list[TeacherInfo]:
    return [TeacherInfo(**t) for t in teacher_meta()]
