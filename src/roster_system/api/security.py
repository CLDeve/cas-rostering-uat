from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError

from roster_system.config import settings
from roster_system.schemas import UserRole

_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthIdentity:
    token: str
    subject: str
    role: UserRole


def resolve_identity_from_token(token: str) -> AuthIdentity:
    token = token.strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    if settings.allow_dev_tokens and token in settings.api_tokens:
        role_raw = settings.api_tokens[token]
        try:
            role = UserRole(role_raw)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Token role misconfigured") from exc
        return AuthIdentity(token=token, subject="dev-token", role=role)

    decode_options: dict[str, bool] = {"require": ["sub", "role", "exp"]}
    kwargs: dict[str, object] = {"algorithms": [settings.jwt_algorithm], "options": decode_options}
    if settings.jwt_audience:
        kwargs["audience"] = settings.jwt_audience
    if settings.jwt_issuer:
        kwargs["issuer"] = settings.jwt_issuer

    try:
        payload = jwt.decode(token, settings.jwt_secret, **kwargs)
    except InvalidTokenError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid or expired token") from exc

    subject = str(payload.get("sub", "")).strip()
    role_raw = str(payload.get("role", "")).strip().upper()
    if not subject:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Token missing subject")

    try:
        role = UserRole(role_raw)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Token has invalid role") from exc

    return AuthIdentity(token=token, subject=subject, role=role)


def get_current_identity(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> AuthIdentity:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    return resolve_identity_from_token(credentials.credentials)


def require_roles(*allowed_roles: UserRole):
    def checker(identity: AuthIdentity = Depends(get_current_identity)) -> AuthIdentity:
        if identity.role not in allowed_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role permissions")
        return identity

    return checker
