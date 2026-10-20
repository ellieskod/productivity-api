import hashlib
import secrets

key = secrets.token_urlsafe(32)
print("API key (give to the agent):", key)
print("key_sha256 (put in AGENT_KEYS):", hashlib.sha256(key.encode()).hexdigest())
