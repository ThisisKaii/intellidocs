"""
IntelliDocs ML Service — Timeline Forensics
Analyzes keystroke composition timelines and DOCX metadata to determine authorship priority.
"""

import io
import os
import json
import re
import zipfile
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum

from docx.opc.coreprops import CoreProperties


class TimelineVerdict(Enum):
    ORIGINAL_AUTHOR = "original_author"
    DERIVATIVE_PASTE = "derivative_paste"
    UNVERIFIED_IMPORT = "unverified_import"
    EXTERNAL_SOURCE = "external_source"
    INCONCLUSIVE = "inconclusive"


class EventType(Enum):
    TYPE = "type"
    PASTE = "paste"
    DELETE = "delete"
    BACKSPACE = "backspace"
    INPUT = "input"
    PAUSE = "pause"


@dataclass
class CompositionEvent:
    """A single composition event from the keystroke log."""
    event_type: EventType
    timestamp: datetime
    char_count: int = 0
    text_preview: str = ""
    position: int = 0
    # Size of the document at event time, for position normalisation.
    doc_size: int = 0
    session_id: Optional[str] = None


@dataclass
class DocumentMetadata:
    """Metadata extracted from DOCX file."""
    created_at: Optional[datetime] = None
    modified_at: Optional[datetime] = None
    last_modified_by: Optional[str] = None
    revision_count: int = 0
    total_edit_time_minutes: int = 0
    application: Optional[str] = None
    word_count: int = 0
    character_count: int = 0
    paragraph_count: int = 0


@dataclass
class CompositionAnalysis:
    """Result of composition timeline analysis."""
    document_id: str
    verdict: TimelineVerdict
    confidence: float
    priority_author: Optional[str] = None
    priority_timestamp: Optional[datetime] = None
    evidence: List[str] = None
    timeline_events: List[CompositionEvent] = None
    doc_metadata: Optional[DocumentMetadata] = None
    
    def __post_init__(self):
        if self.evidence is None:
            self.evidence = []
        if self.timeline_events is None:
            self.timeline_events = []


class TimelineForensics:
    """Analyzes composition timelines to determine authorship priority."""
    
    # Thresholds for detecting bulk paste vs organic typing
    PASTE_CHAR_THRESHOLD = 100  # chars inserted in single event
    PASTE_TIME_THRESHOLD_MS = 500  # ms for bulk insertion
    ORGANIC_TYPING_CPS = 5  # chars per second for organic typing
    MIN_COMPOSITION_TIME_MINUTES = 2  # minimum time for "organic" composition
    
    def __init__(self):
        pass
    
    async def analyze_composition(
        self,
        document_id: str,
        user_id: str,
        target_text: str,
        char_start: int,
        char_end: int,
        redis_client = None,
        docx_bytes: bytes = None,
        timeline_events: List[CompositionEvent] = None,
        document_length: int = 0
    ) -> CompositionAnalysis:
        """
        Main entry point: analyze composition to determine authorship.
        Callers may pass already-loaded events via `timeline_events`; otherwise
        the keystroke timeline is read from Redis. `document_length` is the
        full document length used to map a match's character range onto the
        events' normalised positions.
        """
        # 1. Keystroke timeline: use the supplied events, else read Redis
        if timeline_events is None:
            timeline_events = await self._get_keystroke_timeline(redis_client, document_id, user_id)
        
        # 2. Extract DOCX metadata if available
        doc_metadata = None
        if docx_bytes:
            doc_metadata = self._extract_docx_metadata(docx_bytes)
        
        # 3. Analyze timeline for target text range
        target_events = self._filter_events_for_range(
            timeline_events, char_start, char_end, document_length
        )
        
        # 4. Determine verdict
        verdict, confidence, evidence, priority_author, priority_timestamp = self._determine_verdict(
            target_events, target_text, doc_metadata
        )
        
        return CompositionAnalysis(
            document_id=document_id,
            verdict=verdict,
            confidence=confidence,
            priority_author=priority_author,
            priority_timestamp=priority_timestamp,
            evidence=evidence,
            timeline_events=target_events,
            doc_metadata=doc_metadata
        )
    
    async def _get_keystroke_timeline(
        self,
        redis_client,
        document_id: str,
        user_id: str
    ) -> List[CompositionEvent]:
        """Retrieve keystroke events from Redis."""
        if not redis_client:
            return []
        
        try:
            key = f"behavior:{user_id}:{document_id}:events"
            # Get last 10000 events
            events_data = await redis_client.lrange(key, 0, 10000)
            
            events = []
            for event_json in events_data:
                try:
                    event = json.loads(event_json)
                    events.append(CompositionEvent(
                        event_type=EventType(event.get('action', 'input')),
                        timestamp=datetime.fromisoformat(event.get('timestamp', datetime.utcnow().isoformat())),
                        char_count=event.get('char_count', 0),
                        text_preview=event.get('text_preview', ''),
                        position=event.get('position', 0),
                        session_id=event.get('session_id')
                    ))
                except Exception as e:
                    continue
            
            # Sort by timestamp
            events.sort(key=lambda e: e.timestamp)
            return events
        except Exception as e:
            print(f"[Forensics] Redis error: {e}")
            return []
    
    def _extract_docx_metadata(self, docx_bytes: bytes) -> DocumentMetadata:
        """Extract metadata from DOCX file bytes."""
        metadata = DocumentMetadata()
        
        try:
            with zipfile.ZipFile(io.BytesIO(docx_bytes)) as z:
                # Read core properties
                if 'docProps/core.xml' in z.namelist():
                    core_xml = z.read('docProps/core.xml')
                    core_props = CoreProperties(core_xml)
                    
                    if core_props.created:
                        metadata.created_at = core_props.created
                    if core_props.modified:
                        metadata.modified_at = core_props.modified
                    if core_props.last_modified_by:
                        metadata.last_modified_by = core_props.last_modified_by
                    metadata.revision_count = core_props.revision or 0
                    
                # Read app properties for edit time
                if 'docProps/app.xml' in z.namelist():
                    import xml.etree.ElementTree as ET
                    app_xml = z.read('docProps/app.xml')
                    root = ET.fromstring(app_xml)
                    
                    ns = {'ep': 'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties'}
                    total_time = root.find('.//ep:TotalTime', ns)
                    if total_time is not None and total_time.text:
                        metadata.total_edit_time_minutes = int(total_time.text)
                    
                    words = root.find('.//ep:Words', ns)
                    if words is not None and words.text:
                        metadata.word_count = int(words.text)
                    
                    chars = root.find('.//ep:Characters', ns)
                    if chars is not None and chars.text:
                        metadata.character_count = int(chars.text)
                    
                    paragraphs = root.find('.//ep:Paragraphs', ns)
                    if paragraphs is not None and paragraphs.text:
                        metadata.paragraph_count = int(paragraphs.text)
                        
        except Exception as e:
            print(f"[Forensics] DOCX metadata extraction failed: {e}")
        
        return metadata
    
    def _filter_events_for_range(
        self,
        events: List[CompositionEvent],
        char_start: int,
        char_end: int,
        document_length: int = 0
    ) -> List[CompositionEvent]:
        """
        Filter events that affect the target character range.

        Match ranges are HTML character offsets while event positions are
        ProseMirror document offsets, so both are compared as fractions of
        their document: char offsets over the HTML length, event positions
        over the document size recorded with each event. When no positioned
        event lands in the range (or positions are missing), the full timeline
        is returned so a verdict is never starved of evidence.
        """
        if not events or document_length <= 0:
            return events

        start_ratio = char_start / document_length
        end_ratio = char_end / document_length
        padding = 0.01

        ranged = [
            event
            for event in events
            if event.doc_size > 0
            and (start_ratio - padding)
            <= (event.position / event.doc_size)
            <= (end_ratio + padding)
        ]

        return ranged if ranged else events
    
    def _determine_verdict(
        self,
        target_events: List[CompositionEvent],
        target_text: str,
        doc_metadata: Optional[DocumentMetadata]
    ) -> Tuple[TimelineVerdict, float, List[str], Optional[str], Optional[datetime]]:
        """
        Determine the forensic verdict based on composition evidence.
        Returns: (verdict, confidence, evidence, priority_author, priority_timestamp)
        """
        if not target_events:
            return (
                TimelineVerdict.UNVERIFIED_IMPORT,
                0.3,
                ["No composition events found for this text range"],
                None,
                None
            )
        
        # Analyze event patterns
        paste_events = [e for e in target_events if e.event_type == EventType.PASTE]
        type_events = [e for e in target_events if e.event_type == EventType.TYPE]
        delete_events = [e for e in target_events if e.event_type in (EventType.DELETE, EventType.BACKSPACE)]
        
        total_chars = sum(e.char_count for e in target_events)
        paste_chars = sum(e.char_count for e in paste_events)
        type_chars = sum(e.char_count for e in type_events)
        
        evidence = []
        confidence = 0.5
        verdict = TimelineVerdict.INCONCLUSIVE
        
        # Check for bulk paste (large insertion in short time)
        if paste_events:
            largest_paste = max(paste_events, key=lambda e: e.char_count)
            if largest_paste.char_count > self.PASTE_CHAR_THRESHOLD:
                evidence.append(
                    f"Bulk paste detected: {largest_paste.char_count} characters inserted "
                    f"in single event at {largest_paste.timestamp.isoformat()}"
                )
                verdict = TimelineVerdict.DERIVATIVE_PASTE
                confidence = 0.85
        
        # Check for organic typing pattern
        if type_events:
            # Calculate typing speed
            if len(type_events) > 1:
                time_span = (type_events[-1].timestamp - type_events[0].timestamp).total_seconds()
                if time_span > 0:
                    cps = sum(e.char_count for e in type_events) / time_span
                    if cps <= self.ORGANIC_TYPING_CPS * 2:  # Allow some burst typing
                        evidence.append(f"Organic typing detected: {cps:.1f} chars/sec over {time_span:.1f}s")
                        if verdict == TimelineVerdict.INCONCLUSIVE:
                            verdict = TimelineVerdict.ORIGINAL_AUTHOR
                            confidence = 0.7
        
        # Check for revision history (DOCX)
        if doc_metadata and doc_metadata.revision_count > 1:
            evidence.append(
                f"Document has {doc_metadata.revision_count} revisions, "
                f"{doc_metadata.total_edit_time_minutes} minutes total edit time"
            )
            if doc_metadata.created_at:
                evidence.append(f"Document created at {doc_metadata.created_at.isoformat()}")
        
        # Check for backspace/delete activity (editing vs pasting)
        if delete_events:
            delete_ratio = len(delete_events) / len(target_events)
            if delete_ratio > 0.1:
                evidence.append(f"Active editing detected: {len(delete_events)} deletions/backspaces")
        
        # Determine priority author from metadata
        priority_author = None
        priority_timestamp = None
        
        if doc_metadata and doc_metadata.last_modified_by:
            priority_author = doc_metadata.last_modified_by
            priority_timestamp = doc_metadata.modified_at
        
        # If we have organic typing evidence and no paste, it's original
        if verdict == TimelineVerdict.ORIGINAL_AUTHOR and confidence > 0.6:
            return verdict, confidence, evidence, priority_author, priority_timestamp
        
        # If strong paste evidence, it's derivative
        if verdict == TimelineVerdict.DERIVATIVE_PASTE and confidence > 0.8:
            return verdict, confidence, evidence, priority_author, priority_timestamp
        
        # Check for external import (DOCX with no prior composition)
        if doc_metadata and not target_events:
            if doc_metadata.total_edit_time_minutes < self.MIN_COMPOSITION_TIME_MINUTES:
                verdict = TimelineVerdict.UNVERIFIED_IMPORT
                confidence = 0.6
                evidence.append("Document imported with minimal edit history")
        
        return verdict, confidence, evidence, priority_author, priority_timestamp
    
    def get_timeline_summary(self, events: List[CompositionEvent]) -> Dict[str, Any]:
        """Generate a human-readable summary of the composition timeline."""
        if not events:
            return {"summary": "No composition events recorded"}
        
        total_time = (events[-1].timestamp - events[0].timestamp).total_seconds()
        total_chars = sum(e.char_count for e in events)
        paste_count = len([e for e in events if e.event_type == EventType.PASTE])
        type_count = len([e for e in events if e.event_type == EventType.TYPE])
        
        return {
            "session_duration_seconds": total_time,
            "total_characters": total_chars,
            "paste_events": paste_count,
            "typing_events": type_count,
            "avg_typing_speed_cps": total_chars / max(total_time, 1),
            "first_event": events[0].timestamp.isoformat(),
            "last_event": events[-1].timestamp.isoformat()
        }


async def extract_docx_metadata(file_path: str) -> DocumentMetadata:
    """Extract metadata from a DOCX file on disk."""
    with open(file_path, 'rb') as f:
        docx_bytes = f.read()
    
    forensics = TimelineForensics()
    return forensics._extract_docx_metadata(docx_bytes)


def build_composition_events(raw_events: List[Dict[str, Any]]) -> List[CompositionEvent]:
    """
    Convert stored behavior events into composition events.
    Format-action events are skipped: only composition actions (type, paste,
    delete, backspace, input, pause) carry timeline evidence.
    """
    valid_actions = {event.value for event in EventType}
    events: List[CompositionEvent] = []

    for raw in raw_events or []:
        action = str(raw.get('action', '')).lower()
        if action not in valid_actions:
            continue

        try:
            timestamp = datetime.fromisoformat(str(raw.get('timestamp', '')).replace('Z', '+00:00'))
        except ValueError:
            timestamp = datetime.utcnow()
        # Normalise to naive UTC so timestamp arithmetic never mixes tz-aware
        # and naive datetimes.
        if timestamp.tzinfo is not None:
            timestamp = timestamp.astimezone(timezone.utc).replace(tzinfo=None)

        events.append(CompositionEvent(
            event_type=EventType(action),
            timestamp=timestamp,
            char_count=int(raw.get('char_count', 0) or 0),
            text_preview=str(raw.get('text_preview', '') or ''),
            position=int(raw.get('position', 0) or 0),
            doc_size=int(raw.get('doc_size', 0) or 0),
            session_id=raw.get('session_id'),
        ))

    events.sort(key=lambda event: event.timestamp)
    return events


async def analyze_document_timeline(
    document_id: str,
    user_id: str,
    target_text: str,
    char_start: int,
    char_end: int,
    redis_client = None,
    docx_file_path: str = None
) -> CompositionAnalysis:
    """Convenience function for timeline analysis."""
    forensics = TimelineForensics()
    
    docx_bytes = None
    if docx_file_path:
        with open(docx_file_path, 'rb') as f:
            docx_bytes = f.read()
    
    return await forensics.analyze_composition(
        document_id=document_id,
        user_id=user_id,
        target_text=target_text,
        char_start=char_start,
        char_end=char_end,
        redis_client=redis_client,
        docx_bytes=docx_bytes
    )


# CLI for testing
async def main():
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python timeline_forensics.py <docx_file_path>")
        sys.exit(1)
    
    file_path = sys.argv[1]
    metadata = await extract_docx_metadata(file_path)
    
    print(f"Created: {metadata.created_at}")
    print(f"Modified: {metadata.modified_at}")
    print(f"Last modified by: {metadata.last_modified_by}")
    print(f"Revisions: {metadata.revision_count}")
    print(f"Edit time: {metadata.total_edit_time_minutes} minutes")
    print(f"Word count: {metadata.word_count}")
    print(f"Paragraphs: {metadata.paragraph_count}")


if __name__ == '__main__':
    asyncio.run(main())