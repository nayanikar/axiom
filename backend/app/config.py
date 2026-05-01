from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parent.parent


# Default poll intervals per teacher (seconds). Each can be overridden by env
# var, e.g. AGENT_INTERVAL_ANCHOR=8.
DEFAULT_AGENT_INTERVALS: dict[str, int] = {
    "anchor": 12,
    "analogy": 15,
    "historian": 18,
    "challenger": 20,
    "practical": 22,
    "connector": 25,
    "quiz": 30,
}


class Settings(BaseSettings):
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-20250514"

    spacebase_origin: str = "https://spacebase1.differ.ac"
    space_id: str = "space-6f9708cd-d6f0-4ac5-9c1b-9c6527b37a2a"
    agent_name: str = "todd"

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    database_url: str = Field(
        default_factory=lambda: f"sqlite+aiosqlite:///{BACKEND_ROOT / 'swarmlearn.db'}",
    )

    # Stigmergic scheduler tuning
    watcher_interval_s: float = 4.0
    worker_daily_cap: int = 200
    topic_max_children: int = 12
    topic_max_depth: int = 2

    # Per-agent overrides via env (AGENT_INTERVAL_ANCHOR=8 etc.)
    agent_interval_anchor: int = DEFAULT_AGENT_INTERVALS["anchor"]
    agent_interval_analogy: int = DEFAULT_AGENT_INTERVALS["analogy"]
    agent_interval_historian: int = DEFAULT_AGENT_INTERVALS["historian"]
    agent_interval_challenger: int = DEFAULT_AGENT_INTERVALS["challenger"]
    agent_interval_practical: int = DEFAULT_AGENT_INTERVALS["practical"]
    agent_interval_connector: int = DEFAULT_AGENT_INTERVALS["connector"]
    agent_interval_quiz: int = DEFAULT_AGENT_INTERVALS["quiz"]

    model_config = SettingsConfigDict(
        env_file=str(BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def interval_for(self, teacher_id: str) -> int:
        return getattr(
            self, f"agent_interval_{teacher_id}", DEFAULT_AGENT_INTERVALS.get(teacher_id, 15)
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
