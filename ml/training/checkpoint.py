"""
Checkpoint markers for long-running training jobs.

Training a model on a million-row corpus takes longer than a single unattended
session, and a cancelled or crashed run should not throw away the work that
already completed. Every trainer therefore writes a small JSON marker under
ml/models/checkpoints/ describing which phase it reached, how far it got, and
what it measured. A re-run reads that marker and continues instead of starting
over.

Markers are written atomically (temp file plus os.replace) so killing a run
mid-write can never leave a half-written marker that breaks the next resume.

The marker is the source of truth for "where did we get to". The companion
work directory next to it holds the partial artifacts needed to resume, such
as the half-built feature matrix or the per-epoch LSTM weights.

Inspect the state of any run with:

    python ml/training/checkpoint.py list
    python ml/training/checkpoint.py show compliance
    python ml/training/checkpoint.py clear compliance
"""
from __future__ import annotations

import argparse
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

ROOT_DIR = Path(__file__).resolve().parents[1]
CHECKPOINT_ROOT = ROOT_DIR / "models" / "checkpoints"

# Bumped when the marker layout changes so an old marker is not misread.
CHECKPOINT_VERSION = 1

STATUS_RUNNING = "running"
STATUS_COMPLETE = "complete"
STATUS_FAILED = "failed"


def utc_now() -> str:
    """Return the current UTC time as an ISO-8601 string."""
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class TrainingCheckpoint:
    """
    A resumable phase marker for one training job.

    Use `stage` to record phase transitions, `progress` for fractional
    completion inside a phase, and `done` to close the run out. Work
    directories for partial artifacts live in `work_dir`.
    """

    def __init__(self, name: str, root: Optional[Path] = None) -> None:
        """Resolve the marker and work paths for the named training job."""
        self.name = name
        self.root = Path(root) if root else CHECKPOINT_ROOT
        self.marker_path = self.root / f"{name}.json"
        self.work_dir = self.root / name

    # ------------------------------------------------------------------ state

    def exists(self) -> bool:
        """Return True when a marker file is present for this job."""
        return self.marker_path.is_file()

    def load(self) -> Optional[dict[str, Any]]:
        """Read the marker, returning None when absent or unreadable."""
        if not self.marker_path.is_file():
            return None
        try:
            with open(self.marker_path, "r", encoding="utf-8") as handle:
                data = json.load(handle)
        except (json.JSONDecodeError, OSError) as error:
            print(f"⚠️ Unreadable checkpoint {self.marker_path}: {error}")
            return None
        if data.get("version") != CHECKPOINT_VERSION:
            print(f"⚠️ Checkpoint version mismatch ({data.get('version')}), ignoring it.")
            return None
        return data

    def is_complete(self) -> bool:
        """Return True when the job previously finished successfully."""
        data = self.load()
        return bool(data and data.get("status") == STATUS_COMPLETE)

    # ----------------------------------------------------------------- writes

    def save(
        self,
        stage: str,
        step: int = 0,
        total_steps: int = 0,
        metrics: Optional[dict[str, Any]] = None,
        note: str = "",
        status: str = STATUS_RUNNING,
    ) -> dict[str, Any]:
        """Write the marker atomically and return the stored payload."""
        previous = self.load() or {}
        payload: dict[str, Any] = {
            "version": CHECKPOINT_VERSION,
            "name": self.name,
            "status": status,
            "stage": stage,
            "step": int(step),
            "total_steps": int(total_steps),
            "progress_percent": (
                round(100.0 * step / total_steps, 2) if total_steps else 0.0
            ),
            "metrics": metrics or {},
            "note": note,
            "created_at": previous.get("created_at", utc_now()),
            "updated_at": utc_now(),
        }
        self._write_atomic(payload)
        return payload

    def done(self, metrics: Optional[dict[str, Any]] = None, note: str = "") -> None:
        """Mark the job as finished so a later run can skip straight past it."""
        self.save("done", status=STATUS_COMPLETE, metrics=metrics, note=note)

    def failed(self, stage: str, error: str) -> None:
        """Record a failure, keeping the progress reached before the error."""
        previous = self.load() or {}
        self.save(
            stage,
            step=int(previous.get("step", 0)),
            total_steps=int(previous.get("total_steps", 0)),
            metrics=previous.get("metrics") or {},
            note=error,
            status=STATUS_FAILED,
        )

    def clear(self) -> None:
        """Delete the marker and its work directory so the job restarts clean."""
        if self.marker_path.exists():
            self.marker_path.unlink()
        if self.work_dir.is_dir():
            import shutil

            shutil.rmtree(self.work_dir, ignore_errors=True)

    def _write_atomic(self, payload: dict[str, Any]) -> None:
        """Write the marker via a temp file so an interrupt cannot corrupt it."""
        self.root.mkdir(parents=True, exist_ok=True)
        temp_path = self.marker_path.with_suffix(".json.tmp")
        with open(temp_path, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, self.marker_path)

    # ------------------------------------------------------------------ report

    def status_line(self) -> str:
        """Return a one-line human summary of the marker's state."""
        data = self.load()
        if data is None:
            return f"{self.name}: no checkpoint recorded"

        percent = data.get("progress_percent", 0.0)
        if data.get("status") == STATUS_COMPLETE:
            return f"{self.name}: COMPLETE at {data.get('updated_at')}"
        parts = [
            f"{self.name}: {data.get('status', 'unknown')}",
            f"stage={data.get('stage', '?')}",
            f"step={data.get('step', 0)}/{data.get('total_steps', 0)} ({percent}%)",
        ]
        if data.get("note"):
            parts.append(f"note={data['note']}")
        if data.get("metrics"):
            parts.append(f"metrics={json.dumps(data['metrics'])}")
        return " | ".join(parts)

    def announce(self) -> Optional[dict[str, Any]]:
        """Print the resume decision so a run always states where it starts."""
        data = self.load()
        if data is None:
            print(f"[checkpoint] {self.name}: starting fresh")
            return None
        print(f"[checkpoint] {self.status_line()}")
        if data.get("status") == STATUS_COMPLETE:
            print(f"[checkpoint] {self.name}: already complete, re-run with --force to retrain")
        elif data.get("stage") not in (None, "done"):
            print(f"[checkpoint] {self.name}: resuming from stage '{data['stage']}'")
        return data


def list_checkpoints(root: Optional[Path] = None) -> list[dict[str, Any]]:
    """Return every checkpoint marker found under the checkpoint root."""
    base = Path(root) if root else CHECKPOINT_ROOT
    if not base.is_dir():
        return []

    markers: list[dict[str, Any]] = []
    for path in sorted(base.glob("*.json")):
        try:
            with open(path, "r", encoding="utf-8") as handle:
                markers.append(json.load(handle))
        except (json.JSONDecodeError, OSError):
            markers.append({"name": path.stem, "status": "unreadable"})
    return markers


def format_age(timestamp: str) -> str:
    """Return a human readable age for an ISO-8601 marker timestamp."""
    try:
        created = datetime.fromisoformat(timestamp)
    except (TypeError, ValueError):
        return "unknown age"
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    seconds = max(0, int(time.time() - created.timestamp()))
    if seconds < 60:
        return f"{seconds}s ago"
    if seconds < 3600:
        return f"{seconds // 60}m ago"
    if seconds < 86400:
        return f"{seconds // 3600}h ago"
    return f"{seconds // 86400}d ago"


def main() -> None:
    """List, show, or clear training checkpoint markers."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["list", "show", "clear", "clear-all"])
    parser.add_argument("name", nargs="?", help="checkpoint name for show/clear")
    args = parser.parse_args()

    if args.command == "list":
        markers = list_checkpoints()
        if not markers:
            print(f"No checkpoints under {CHECKPOINT_ROOT}")
            return
        for marker in markers:
            status = marker.get("status", "unknown")
            stage = marker.get("stage", "?")
            percent = marker.get("progress_percent", 0.0)
            age = format_age(str(marker.get("updated_at", "")))
            print(f"  {marker.get('name', '?'):<22} {status:<9} {stage:<14} {percent:>6}%  {age}")
        return

    if args.command == "clear-all":
        for marker in list_checkpoints():
            TrainingCheckpoint(str(marker.get("name"))).clear()
            print(f"cleared {marker.get('name')}")
        return

    if not args.name:
        parser.error("a checkpoint name is required for show/clear")

    checkpoint = TrainingCheckpoint(args.name)
    if args.command == "show":
        print(checkpoint.status_line())
        data = checkpoint.load()
        if data:
            print(json.dumps(data, indent=2))
    else:
        checkpoint.clear()
        print(f"cleared checkpoint '{args.name}'")


if __name__ == "__main__":
    main()
