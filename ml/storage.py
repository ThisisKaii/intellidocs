"""Supabase Storage helpers for fine-tuned models and the base ONNX model.

Per-user fine-tuned models live in the `user-models` bucket. The ML service
downloads them into a 24h TempDir cache so repeated predictions don't hit
storage on every request.

The base DistilBERT INT8 ONNX model (training/artifact) lives in the
`ml-models` bucket and is streamed into the same temp cache at FastAPI
startup. A local `ml/models/distilbert_int8.onnx` file is the fallback when
storage is unreachable.

Requires SUPABASE_URL + SUPABASE_SERVICE_KEY in the environment (same names the
Node backend uses).
"""

import hashlib
import json
import os
import tempfile
import time
from pathlib import Path
from typing import Optional, Tuple

CACHE_TTL_SECONDS = 24 * 60 * 60
BUCKET = "user-models"
BASE_MODEL_BUCKET = "ml-models"
BASE_ONNX_OBJECT = "distilbert_int8.onnx"
BASE_ONNX_LABELS_OBJECT = "distilbert_labels.json"


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


def _local_models_dir() -> Path:
    """Return the ml/models directory used as the offline fallback for the base ONNX model."""
    return Path(__file__).resolve().parent / "models"


def download_base_onnx_model() -> Tuple[Optional[str], Optional[str]]:
    """Return (onnx_path, labels_path) for the base DistilBERT ONNX model.

    Prefers the 24h temp cache backed by the `ml-models` bucket, then falls back
    to a local `ml/models/distilbert_int8.onnx` + `distilbert_labels.json`.
    Returns (None, None) when the model is unavailable anywhere.
    """
    onnx_local = _cache_path(BASE_ONNX_OBJECT)
    labels_local = _cache_path(BASE_ONNX_LABELS_OBJECT)

    if not (_is_fresh(onnx_local) and _is_fresh(labels_local)):
        try:
            client = _client()
            bucket = client.storage.from_(BASE_MODEL_BUCKET)
            onnx_local.write_bytes(bucket.download(BASE_ONNX_OBJECT))
            labels_local.write_bytes(bucket.download(BASE_ONNX_LABELS_OBJECT))
        except Exception as exc:  # noqa: BLE001 - optional network feature
            print(f"Base ONNX download warning: {exc}")
            local_onnx = _local_models_dir() / BASE_ONNX_OBJECT
            local_labels = _local_models_dir() / BASE_ONNX_LABELS_OBJECT
            if not (local_onnx.exists() and local_labels.exists()):
                return (None, None)
            return (str(local_onnx), str(local_labels))

    return (str(onnx_local), str(labels_local))


def upload_base_onnx_model(onnx_path: str, labels_path: str) -> bool:
    """Upload a freshly quantized base ONNX model + its label map to the ml-models bucket."""
    try:
        client = _client()
        client.storage.create_bucket(BASE_MODEL_BUCKET, public=False)
    except Exception:
        pass  # bucket likely already exists

    try:
        bucket = _client().storage.from_(BASE_MODEL_BUCKET)
        bucket.upload(BASE_ONNX_OBJECT, Path(onnx_path).read_bytes())
        bucket.upload(BASE_ONNX_LABELS_OBJECT, Path(labels_path).read_bytes())
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"Base ONNX upload warning: {exc}")
        return False