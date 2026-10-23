"""
IntelliDocs ML Service — 3-Stage Triage Filter for 50+ Page Scalability
Implements the hierarchical funnel: Local Pre-filter → Context Windowing → AI Council.
"""

import re
import asyncio
from typing import List, Dict, Any, Optional, Tuple, Set
from dataclasses import dataclass
from enum import Enum

from council_pipeline import run_council_review, CouncilVerdict


def extract_paragraphs(html_content: str, min_length: int = 50) -> List[Tuple[int, str, int, int]]:
    """
    Extract paragraphs without importing the embedding service eagerly.
    The embedding module builds API clients at import time, so it is only
    imported by the code paths that actually need embeddings.
    """
    from embedding_service import extract_paragraphs as _extract
    return _extract(html_content, min_length)


class MatchType(Enum):
    VERBATIM = "verbatim"
    PARAPHRASED = "paraphrased"
    UNCITED_FACT = "uncited_fact"
    EXTERNAL_SOURCE = "external_source"
    ORIGINAL = "original"


class MatchSeverity(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class TriageConfig:
    """Configuration for the 3-stage triage."""
    # Stage 1: Local pre-filter
    min_paragraph_length: int = 50
    verbatim_threshold: float = 0.95
    paraphrase_threshold: float = 0.80
    max_local_matches_per_doc: int = 50
    
    # Stage 2: Context windowing
    context_sentences_before: int = 1
    context_sentences_after: int = 1
    max_cluster_size: int = 5
    cluster_gap_sentences: int = 3
    
    # Stage 3: Council
    council_timeout: int = 8
    council_min_quorum: int = 3


@dataclass
class ParagraphCluster:
    """A cluster of related suspect paragraphs."""
    cluster_id: str
    paragraphs: List[Dict[str, Any]]
    matched_sources: List[Dict[str, Any]]
    chapter_section: Optional[str] = None
    aggregate_severity: MatchSeverity = MatchSeverity.LOW


@dataclass
class TriageResult:
    """Result of the full triage process."""
    clean_paragraphs: int
    flagged_clusters: List[ParagraphCluster]
    council_verdicts: List[Any]
    processing_time_ms: float
    tokens_saved: int


class TriageFilter:
    """Implements the 3-stage triage filter for scalable plagiarism detection."""
    
    def __init__(self, config: TriageConfig = None):
        self.config = config or TriageConfig()
    
    async def process_document(
        self,
        document_id: str,
        html_content: str,
        user_id: str,
        folder_id: str,
        composition_timeline: Dict = None
    ) -> TriageResult:
        """
        Run the full 3-stage triage on a document.
        """
        import time
        start_time = time.time()
        
        # Stage 1: Local Pre-filter
        print(f"[Triage] Stage 1: Local pre-filter for document {document_id}")
        flagged_paragraphs = await self._stage1_local_pre_filter(
            document_id, html_content, user_id, folder_id
        )
        
        if not flagged_paragraphs:
            return TriageResult(
                clean_paragraphs=len(extract_paragraphs(html_content)),
                flagged_clusters=[],
                council_verdicts=[],
                processing_time_ms=(time.time() - start_time) * 1000,
                tokens_saved=0
            )
        
        # Stage 2: Context Windowing & Clustering
        print(f"[Triage] Stage 2: Context windowing for {len(flagged_paragraphs)} flagged paragraphs")
        clusters = await self._stage2_context_windowing(
            flagged_paragraphs, html_content
        )
        
        # Stage 3: AI Council Review
        print(f"[Triage] Stage 3: Council review for {len(clusters)} clusters")
        council_verdicts = await self._stage3_council_review(
            clusters, composition_timeline
        )
        
        # Calculate tokens saved
        total_paragraphs = len(extract_paragraphs(html_content))
        clean_paragraphs = total_paragraphs - sum(len(c.paragraphs) for c in flagged_paragraphs)
        estimated_tokens = clean_paragraphs * 50  # ~50 tokens per paragraph
        
        return TriageResult(
            clean_paragraphs=clean_paragraphs,
            flagged_clusters=flagged_paragraphs,
            council_verdicts=council_verdicts,
            processing_time_ms=(time.time() - start_time) * 1000,
            tokens_saved=estimated_tokens
        )
    
    async def _stage1_local_pre_filter(
        self,
        document_id: str,
        html_content: str,
        user_id: str,
        folder_id: str
    ) -> List[Dict[str, Any]]:
        """
        Stage 1: Lightweight local pre-filter.
        - Skip front/back matter
        - Run fast local similarity checks
        - Only flag paragraphs above threshold
        """
        # Extract paragraphs (skips front/back matter)
        paragraphs = extract_paragraphs(html_content, self.config.min_paragraph_length)
        
        if not paragraphs:
            return []
        
        # Generate embeddings for all paragraphs
        from embedding_service import generate_embeddings_batch, find_similar_paragraphs
        
        texts = [p[1] for p in paragraphs]
        embeddings = await generate_embeddings_batch(texts)
        
        flagged = []
        
        # Check each paragraph against class folder
        for (para_idx, text, char_start, char_end), embedding in zip(paragraphs, embeddings):
            # Without an embedding provider every vector is zeros; skip instead
            # of searching with a zero vector (cosine distance is undefined).
            if not any(embedding):
                continue
            matches = await find_similar_paragraphs(
                target_embedding=embedding,
                class_folder_id=folder_id,
                exclude_document_id=document_id,
                similarity_threshold=self.config.paraphrase_threshold,
                max_results=self.config.max_local_matches_per_doc
            )
            
            if matches:
                # Determine match type and severity
                best_match = matches[0]
                if best_match.similarity >= self.config.verbatim_threshold:
                    match_type = MatchType.VERBATIM
                    severity = MatchSeverity.CRITICAL
                elif best_match.similarity >= self.config.paraphrase_threshold:
                    match_type = MatchType.PARAPHRASED
                    severity = MatchSeverity.HIGH
                else:
                    continue  # Below threshold
                
                flagged.append({
                    'match_id': f"{document_id}-{para_idx}",
                    'paragraph_index': para_idx,
                    'text': text,
                    'char_start': char_start,
                    'char_end': char_end,
                    'matched_document_id': best_match.document_id,
                    'matched_student_id': best_match.user_id,
                    'similarity_score': best_match.similarity,
                    'match_type': match_type.value,
                    'match_severity': severity.value,
                    'source_excerpt': best_match.paragraph_text[:500],
                    'target_excerpt': text[:500]
                })
        
        return flagged
    
    async def process_document_with_peers(
        self,
        document_id: str,
        html_content: str,
        user_id: str,
        folder_id: str,
        peers: List[Dict[str, Any]],
        composition_timeline: Dict = None
    ) -> TriageResult:
        """
        Run the triage when peer documents are supplied directly (class-folder
        scan). Stage 1 compares paragraphs lexically against the peers, so no
        embedding provider or pgvector round-trip is required.
        """
        import time
        start_time = time.time()

        print(f"[Triage] Stage 1: local peer pre-filter for document {document_id}")
        flagged_paragraphs = self._stage1_peer_pre_filter(
            document_id, html_content, peers
        )

        if not flagged_paragraphs:
            return TriageResult(
                clean_paragraphs=len(extract_paragraphs(html_content)),
                flagged_clusters=[],
                council_verdicts=[],
                processing_time_ms=(time.time() - start_time) * 1000,
                tokens_saved=0
            )

        print(f"[Triage] Stage 2: Context windowing for {len(flagged_paragraphs)} flagged paragraphs")
        clusters = await self._stage2_context_windowing(
            flagged_paragraphs, html_content
        )

        print(f"[Triage] Stage 3: Council review for {len(clusters)} clusters")
        council_verdicts = await self._stage3_council_review(
            clusters, composition_timeline
        )

        total_paragraphs = len(extract_paragraphs(html_content))
        clean_paragraphs = total_paragraphs - len(flagged_paragraphs)
        return TriageResult(
            clean_paragraphs=clean_paragraphs,
            flagged_clusters=flagged_paragraphs,
            council_verdicts=council_verdicts,
            processing_time_ms=(time.time() - start_time) * 1000,
            tokens_saved=clean_paragraphs * 50
        )

    def _stage1_peer_pre_filter(
        self,
        document_id: str,
        html_content: str,
        peers: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Stage 1 (peers mode): lexical pre-filter with difflib.
        Candidate matches come from direct string comparison against every
        paragraph of every peer document.
        """
        import difflib

        paragraphs = extract_paragraphs(html_content, self.config.min_paragraph_length)
        if not paragraphs:
            return []

        peer_paragraphs: List[Dict[str, Any]] = []
        for peer in peers:
            peer_id = str(peer.get('document_id', ''))
            peer_user = str(peer.get('user_id', ''))
            peer_html = peer.get('text', '') or ''
            for (_idx, text, _start, _end) in extract_paragraphs(peer_html, self.config.min_paragraph_length):
                peer_paragraphs.append({
                    'document_id': peer_id,
                    'user_id': peer_user,
                    'text': text,
                })

        if not peer_paragraphs:
            return []

        flagged: List[Dict[str, Any]] = []
        for (para_idx, text, char_start, char_end) in paragraphs:
            best_ratio = 0.0
            best_peer: Optional[Dict[str, Any]] = None
            for peer_para in peer_paragraphs:
                ratio = difflib.SequenceMatcher(None, text, peer_para['text']).ratio()
                if ratio > best_ratio:
                    best_ratio = ratio
                    best_peer = peer_para

            if best_peer is None or best_ratio < self.config.paraphrase_threshold:
                continue

            if best_ratio >= self.config.verbatim_threshold:
                match_type = MatchType.VERBATIM
                severity = MatchSeverity.CRITICAL
            else:
                match_type = MatchType.PARAPHRASED
                severity = MatchSeverity.HIGH

            flagged.append({
                'match_id': f"{document_id}-{para_idx}",
                'paragraph_index': para_idx,
                'text': text,
                'char_start': char_start,
                'char_end': char_end,
                'matched_document_id': best_peer['document_id'],
                'matched_student_id': best_peer['user_id'],
                'similarity_score': round(best_ratio, 4),
                'match_type': match_type.value,
                'match_severity': severity.value,
                'source_excerpt': best_peer['text'][:500],
                'target_excerpt': text[:500],
            })

        return flagged

    async def _stage2_context_windowing(
        self,
        flagged_paragraphs: List[Dict],
        html_content: str
    ) -> List[ParagraphCluster]:
        """
        Stage 2: Context-preserving windowing & batching.
        - Group nearby flagged paragraphs into clusters
        - Add context sentences
        - Package with matched source for Council
        """
        if not flagged_paragraphs:
            return []
        
        # Sort by paragraph index
        flagged_paragraphs.sort(key=lambda x: x['paragraph_index'])
        
        # Group into clusters
        clusters = []
        current_cluster = []
        cluster_gap = 0
        
        for fp in flagged_paragraphs:
            if not current_cluster:
                current_cluster.append(fp)
                continue
            
            # Check gap from last paragraph in cluster
            last_idx = current_cluster[-1]['paragraph_index']
            gap = fp['paragraph_index'] - last_idx
            
            if gap <= self.config.cluster_gap_sentences:
                # Same cluster
                current_cluster.append(fp)
            else:
                # New cluster
                if current_cluster:
                    clusters.append(self._build_cluster(current_cluster))
                current_cluster = [fp]
        
        # Don't forget last cluster
        if current_cluster:
            clusters.append(self._build_cluster(current_cluster))
        
        # Add context to each cluster
        for cluster in clusters:
            cluster.paragraphs = self._add_context_sentences(
                cluster.paragraphs, html_content
            )
        
        return clusters
    
    def _build_cluster(self, paragraphs: List[Dict]) -> ParagraphCluster:
        """Build a cluster from a list of paragraphs."""
        # Determine aggregate severity
        severities = [MatchSeverity(p['match_severity']) for p in paragraphs]
        severity_order = {MatchSeverity.LOW: 0, MatchSeverity.MEDIUM: 1, MatchSeverity.HIGH: 2, MatchSeverity.CRITICAL: 3}
        max_severity = max(severities, key=lambda s: severity_order[s])
        
        return ParagraphCluster(
            cluster_id=f"cluster-{paragraphs[0]['paragraph_index']}",
            paragraphs=paragraphs,
            matched_sources=[],  # Will be populated in stage 3
            aggregate_severity=max_severity
        )
    
    def _add_context_sentences(
        self,
        paragraphs: List[Dict],
        html_content: str
    ) -> List[Dict]:
        """
        Add context sentences before/after each flagged paragraph.
        """
        from bs4 import BeautifulSoup
        
        soup = BeautifulSoup(html_content, 'html.parser')
        all_text = soup.get_text()
        sentences = re.split(r'(?<=[.!?])\s+', all_text)
        
        # Map paragraph text to sentence indices
        enriched = []
        for p in paragraphs:
            # Find the sentence index containing this paragraph
            para_text = p['text']
            best_idx = -1
            best_overlap = 0
            
            for i, sent in enumerate(sentences):
                if para_text[:50] in sent or sent[:50] in para_text:
                    overlap = len(set(para_text.split()) & set(sent.split()))
                    if overlap > best_overlap:
                        best_overlap = overlap
                        best_idx = i
            
            # Add context
            context_before = max(0, best_idx - self.config.context_sentences_before)
            context_after = min(len(sentences), best_idx + self.config.context_sentences_after + 1)
            
            context_text = ' '.join(sentences[context_before:context_after])
            
            enriched.append({
                **p,
                'context_text': context_text,
                'context_sentences_before': best_idx - context_before,
                'context_sentences_after': context_after - best_idx - 1
            })
        
        return enriched
    
    async def _stage3_council_review(
        self,
        clusters: List[ParagraphCluster],
        composition_timeline: Dict = None
    ) -> List[CouncilVerdict]:
        """
        Stage 3: AI Council Review.
        Run the Council on each cluster.
        """
        verdicts = []
        
        for cluster in clusters:
            # Prepare match data for Council
            for para in cluster.paragraphs:
                match_data = {
                    'match_id': para['match_id'],
                    'suspect_text': para['text'],
                    'source_text': para.get('source_excerpt', ''),
                    'similarity_score': para['similarity_score'],
                    'match_type': para['match_type'],
                    'match_id': para['match_id'],
                    'composition_timeline': {},  # Will be filled by forensics module
                    'external_sources': []
                }
                
                verdict = await run_council_review(**match_data)
                verdicts.append(verdict)
        
        return verdicts


# ─── Convenience function ───

async def run_full_triage(
    document_id: str,
    html_content: str,
    user_id: str,
    folder_id: str,
    composition_timeline: Dict = None,
    config: TriageConfig = None
) -> TriageResult:
    """Convenience function to run the full triage pipeline."""
    filter = TriageFilter(config)
    return await filter.process_document(
        document_id, html_content, user_id, folder_id, composition_timeline
    )


async def run_full_triage_with_peers(
    document_id: str,
    html_content: str,
    user_id: str,
    folder_id: str,
    peers: List[Dict[str, Any]],
    composition_timeline: Dict = None,
    config: TriageConfig = None
) -> TriageResult:
    """Convenience function for the class-folder scan path (peer texts supplied)."""
    filter = TriageFilter(config)
    return await filter.process_document_with_peers(
        document_id, html_content, user_id, folder_id, peers, composition_timeline
    )


# CLI for testing
async def main():
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python triage_filter.py <document_id>")
        sys.exit(1)
    
    document_id = sys.argv[1]
    
    # Load test document
    from supabase import create_client
    import os
    
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_KEY')
    
    from supabase import create_client
    supabase = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_KEY'))
    
    result = supabase.table('documents').select('id, content, user_id, folder_id').eq('id', document_id).single().execute()
    doc = result.data
    
    if not doc:
        print(f"Document {document_id} not found")
        return
    
    result = await run_full_triage(
        document_id=doc['id'],
        html_content=doc['content'],
        user_id=doc['user_id'],
        folder_id=doc['folder_id']
    )
    
    print(f"Clean paragraphs: {result.clean_paragraphs}")
    print(f"Flagged clusters: {len(result.flagged_clusters)}")
    print(f"Council verdicts: {len(result.council_verdicts)}")
    print(f"Processing time: {result.processing_time_ms:.1f}ms")
    print(f"Tokens saved: {result.tokens_saved}")


if __name__ == '__main__':
    import re
    asyncio.run(main())