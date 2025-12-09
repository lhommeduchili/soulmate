from __future__ import annotations

import base64
import os
from fastapi import Depends, HTTPException, Request, status


def require_basic_auth(request: Request):
    user = os.getenv("BASIC_AUTH_USER")
    password = os.getenv("BASIC_AUTH_PASS")
    if not user or not password:
        return

    auth_header = request.headers.get("authorization")
    if not auth_header or not auth_header.lower().startswith("basic "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Basic auth required",
            headers={"WWW-Authenticate": "Basic"},
        )
    try:
        encoded = auth_header.split(" ", 1)[1]
        decoded = base64.b64decode(encoded).decode("utf-8")
        provided_user, provided_pass = decoded.split(":", 1)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid auth header",
            headers={"WWW-Authenticate": "Basic"},
        )
    if provided_user != user or provided_pass != password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )


# Dependency shortcut
def basic_auth_dependency():
    return Depends(require_basic_auth)
