from __future__ import annotations

import json
import os
import secrets
import time
from dataclasses import dataclass
from hashlib import pbkdf2_hmac
from typing import Dict, Optional

USER_SESSION_COOKIE = "soulmate_user"
_USER_DB_PATH = os.getenv("USER_DB_PATH", "users.json")
_USER_SESSIONS: Dict[str, Dict[str, str]] = {}
_SESSION_TTL = 12 * 60 * 60  # 12h


@dataclass
class User:
    username: str
    password_hash: str
    salt: str


def _load_users() -> Dict[str, User]:
    if not os.path.exists(_USER_DB_PATH):
        return {}
    try:
        with open(_USER_DB_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return {}
    users: Dict[str, User] = {}
    for u in data:
        try:
            users[u["username"]] = User(username=u["username"], password_hash=u["password_hash"], salt=u["salt"])
        except Exception:
            continue
    return users


def _save_users(users: Dict[str, User]) -> None:
    payload = [
        {"username": u.username, "password_hash": u.password_hash, "salt": u.salt}
        for u in users.values()
    ]
    with open(_USER_DB_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f)


def _hash_password(password: str, salt: str) -> str:
    dk = pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
    return dk.hex()


def create_user(username: str, password: str) -> User:
    username = username.strip()
    if not username or not password:
        raise ValueError("Usuario y contraseña requeridos")
    users = _load_users()
    if username in users:
        raise ValueError("Usuario ya existe")
    salt = secrets.token_hex(16)
    pwd_hash = _hash_password(password, salt)
    user = User(username=username, password_hash=pwd_hash, salt=salt)
    users[username] = user
    _save_users(users)
    return user


def authenticate(username: str, password: str) -> Optional[User]:
    users = _load_users()
    user = users.get(username)
    if not user:
        return None
    if _hash_password(password, user.salt) != user.password_hash:
        return None
    return user


def create_session(username: str) -> str:
    token = secrets.token_urlsafe(32)
    _USER_SESSIONS[token] = {"username": username, "created_at": time.time()}
    _prune_sessions()
    return token


def _prune_sessions() -> None:
    now = time.time()
    for token, data in list(_USER_SESSIONS.items()):
        if now - data.get("created_at", 0) > _SESSION_TTL:
            _USER_SESSIONS.pop(token, None)


def get_user_from_token(token: Optional[str]) -> Optional[str]:
    if not token:
        return None
    _prune_sessions()
    data = _USER_SESSIONS.get(token)
    if not data:
        return None
    return data.get("username")


def destroy_session(token: Optional[str]) -> None:
    if token:
        _USER_SESSIONS.pop(token, None)
