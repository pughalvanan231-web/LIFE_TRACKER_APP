from typing import Any, Dict, Optional
from app.schemas.common import AppBaseModel


class AuthenticatedUser(AppBaseModel):
    """Secure runtime representation of an authenticated Firebase user."""

    uid: str
    email: Optional[str] = None
    email_verified: bool = False
    name: Optional[str] = None
    picture: Optional[str] = None
    auth_time: Optional[int] = None
    claims: Dict[str, Any] = {}

    @classmethod
    def from_token_claims(cls, claims: Dict[str, Any]) -> "AuthenticatedUser":
        """
        Instantiate strictly from verified Firebase token claims.
        Security Rule: The user ID is derived solely from the verified JWT 'uid' / 'sub'.
        """
        uid = claims.get("uid") or claims.get("sub")
        if not uid or not str(uid).strip():
            raise ValueError("Token claims missing valid 'uid' or 'sub' subject.")

        return cls(
            uid=str(uid).strip(),
            email=claims.get("email"),
            email_verified=bool(claims.get("email_verified", False)),
            name=claims.get("name"),
            picture=claims.get("picture"),
            auth_time=claims.get("auth_time"),
            claims={
                k: v
                for k, v in claims.items()
                if k not in {"uid", "sub", "email", "email_verified", "name", "picture", "auth_time"}
            },
        )


class SafeUserProfile(AppBaseModel):
    """Safe account representation returned to clients without internal claims."""

    uid: str
    email: Optional[str] = None
    email_verified: bool = False
    display_name: Optional[str] = None
    photo_url: Optional[str] = None
