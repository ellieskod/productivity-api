from typing import Dict, List, Optional

from pydantic import BaseModel
from pydantic_settings import BaseSettings


class Agent(BaseModel):
    key_sha256: str
    scopes: List[str] = []


class Settings(BaseSettings):
    agent_keys: Dict[str, Agent] = {}
    teamup_calendar_key: str = ""
    teamup_api_key: str = ""
    teamup_default_subcalendar_id: Optional[int] = None
    teamup_webhook_secret: str = ""


def get_settings() -> Settings:
    return Settings()

