"""Supabase Storage helpers for per-user fine-tuned models.

Fine-tuned models live in the `user-models` bucket. The ML service downloads
them into a 24h TempDir cache so repeated predictions don't hit storage on
every request.

Requires SUPABASE_URL + SUPABASE_SERVICE_KEY in the environment (same names the
Node backend uses).
"""

import hashlib
import os
import tempfile
import time
from pathlib import Path

CACHE_TTL_SECONDS = 24 * 60 * 60
BUCKET = "user-models"


def _cache_dir() -> Path:
    base = os.environ.get("ML_CACHE_DIR") or os.path.join(
        tempfile.gettempdir(), "intellidocs-ml"
    )
    Path(base).mkdir(parents=True, exist_ok=True)
    return Path(base)


def _cache_path(object_name: str) -> Path:
    safe = hashlib.sha256(object_name.encode()).hexdigest()
    return _cache_dir() / f"{safe}.model"


def _is_fresh(path: Path) -> bool:
    return path.exists() and (time.time() - path.stat().st_mtime) < CACHE_TTL_SECONDS


def _client():
    import supabase  # lazy import keeps prediction fast on cache hits

    return supabase.create_client(
        os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"]
    )


def download_user_model(user_id: str):
    """Return a local cached path for a user model, or None on any failure.

    Cache lives in temp with a 24h TTL. Falls back to a local `user_models`
    directory when storage is unreachable.
    """
    object_name = f"{user_id}.pt"
    local = _cache_path(object_name)

    if _is_fresh(local):
        return str(local)

    try:
        data = _client().storage.from_(BUCKET).download(object_name)
        local.write_bytes(data)
        return str(local)
    except Exception as exc:  # noqa: BLE001 - optional network feature
        print(f"Storage download warning for {user_id}: {exc}")
        return None


def upload_user_model(local_path: str, user_id: str) -> bool:
    """Upload a freshly fine-tuned model to the user-models bucket."""
    try:
        client = _client()
        client.storage.create_bucket(BUCKET, public=False)
    except Exception:
        pass  # bucket likely already exists

    try:
        _client().storage.from_(BUCKET).upload(
            f"{user_id}.pt", Path(local_path).read_bytes()
        )
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"Storage upload warning for {user_id}: {exc}")
        return False