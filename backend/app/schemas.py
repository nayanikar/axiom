from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class TeacherInfo(BaseModel):
    id: str
    name: str
    role: str
    avatar: str
    color: str
    bg: str
    border: str


class TopicCreate(BaseModel):
    text: str = Field(min_length=1, max_length=500)


class AgentResponseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    teacher_id: str
    worker_agent_id: str
    status: str
    text: Optional[str] = None
    intent_id: Optional[str] = None
    error: Optional[str] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


class TopicRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    text: str
    root_intent_id: Optional[str] = None
    status: str
    source: str
    parent_topic_id: Optional[str] = None
    spawned_by_teacher_id: Optional[str] = None
    depth: int = 0
    created_at: datetime
    responses: list[AgentResponseRead] = Field(default_factory=list)


class TopicSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    text: str
    root_intent_id: Optional[str] = None
    status: str
    source: str
    parent_topic_id: Optional[str] = None
    spawned_by_teacher_id: Optional[str] = None
    depth: int = 0
    created_at: datetime
    response_count: int = 0
    responding_teacher_ids: list[str] = Field(default_factory=list)
    done_teacher_ids: list[str] = Field(default_factory=list)


class WorkerStateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    teacher_id: str
    worker_agent_id: str
    status: str
    last_poll_at: Optional[datetime] = None
    last_picked_topic_id: Optional[str] = None
    last_picked_at: Optional[datetime] = None
    last_error: Optional[str] = None
    calls_today: int = 0
    interval_s: int = 0
    daily_cap: int = 0


class SpaceStatus(BaseModel):
    connected: bool
    simulated: bool
    space_id: Optional[str] = None
    agent_name: Optional[str] = None
    observatory_url: Optional[str] = None
    origin: Optional[str] = None
    agents_paused: bool = False


class AgentsPauseBody(BaseModel):
    paused: bool


class ClaimRequest(BaseModel):
    claim_url: str
    agent_name: Optional[str] = None


class ClaimResult(BaseModel):
    ok: bool
    status: int
    message: Optional[str] = None
    binding: Optional[SpaceStatus] = None
    raw: Optional[dict] = None
