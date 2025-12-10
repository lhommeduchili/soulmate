from __future__ import annotations

import os
from typing import Any, Dict, Optional

import jwt
from fastapi import HTTPException, Request, status


def _jwt_secret() -> str:
    secret = os.getenv("SUPABASE_JWT_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="SUPABASE_JWT_SECRET no configurado en el servidor")
    return secret


def verify_request_user(request: Request) -> Dict[str, Any]:
    """Validate bearer token from Authorization header using Supabase JWT secret."""
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token ausente")
    token = auth.split(" ", 1)[1]
    secret = _jwt_secret()
    aud = os.getenv("SUPABASE_JWT_AUD", "authenticated")
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            audience=aud if aud else None,
            options={"verify_aud": bool(aud)},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expirado")
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Token inválido: {exc}")
    return payload


def user_id_from_payload(payload: Dict[str, Any]) -> str:
    return payload.get("sub") or payload.get("user_id") or payload.get("email") or "guest"
