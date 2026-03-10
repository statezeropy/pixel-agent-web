"""Fernet encryption utilities for API key storage."""

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


def _get_fernet() -> Fernet:
    """Return a Fernet instance from the configured encryption key."""
    if not settings.ENCRYPTION_KEY:
        raise RuntimeError(
            "ENCRYPTION_KEY is not set. "
            "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    return Fernet(settings.ENCRYPTION_KEY.encode())


def encrypt_api_key(plain_key: str) -> str:
    """Encrypt an API key and return the ciphertext as a UTF-8 string."""
    fernet = _get_fernet()
    return fernet.encrypt(plain_key.encode()).decode()


def decrypt_api_key(encrypted_key: str) -> str:
    """Decrypt an API key. Raises ValueError on invalid token."""
    fernet = _get_fernet()
    try:
        return fernet.decrypt(encrypted_key.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Failed to decrypt API key -- invalid token or wrong encryption key") from exc
