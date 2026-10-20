import hashlib
import hmac
from typing import Callable

from fastapi import Depends, Header, HTTPException

from .config import Agent, Settings, get_settings


def authenticate(
    authorization: str = Header(default=""),
    settings: Settings = Depends(get_settings),
) -> "tuple[str, Agent]":
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(401, "Missing bearer token")
    digest = hashlib.sha256(token.encode()).hexdigest()
    for name, agent in settings.agent_keys.items():
        if hmac.compare_digest(digest, agent.key_sha256.lower()):
            return name, agent
    raise HTTPException(401, "Invalid token")


def require_scope(scope: str) -> Callable:
    def dep(who=Depends(authenticate)):
        name, agent = who
        if scope not in agent.scopes:
            raise HTTPException(403, "Missing scope: " + scope)
        return name

    return dep
