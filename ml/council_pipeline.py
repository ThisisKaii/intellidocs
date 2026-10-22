"""
IntelliDocs ML Service — Multi-Agent AI Council for Plagiarism Detection
Implements the 5-Judge Council with specialized academic personas.
"""

import os
import json
import asyncio
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict
from datetime import datetime
from enum import Enum

from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()

# AI Provider Configuration
AI_PROVIDER = os.getenv("AI_PROVIDER", "openrouter")
AI_API_KEY = os.getenv("AI_API_KEY")
AI_MODEL = os.getenv("AI_MODEL", "openrouter/auto")

# OpenAI-compatible endpoints per provider. The council speaks the OpenAI chat
# API, so each provider (Gemini, NVIDIA NIM included) exposes a compatible
# base URL.
AI_BASE_URLS: Dict[str, Optional[str]] = {
    'openai': None,
    'gemini': 'https://generativelanguage.googleapis.com/v1beta/openai/',
    'groq': 'https://api.groq.com/openai/v1',
    'openrouter': 'https://openrouter.ai/api/v1',
    'mistral': 'https://api.mistral.ai/v1',
    'nvidia': 'https://integrate.api.nvidia.com/v1',
}

_AI_OVERRIDE: Dict[str, Optional[str]] = {}
_clients_cache: Dict[tuple, List[AsyncOpenAI]] = {}
_preferred_key_index: int = 0
# Free tiers queue concurrent completions; running at most two at a time keeps
# the four parallel judges inside their per-call timeout on a single key.
_COMPLETION_SEMAPHORE = asyncio.Semaphore(2)


def configure_ai(
    provider: Optional[str] = None,
    api_key: Optional[str] = None,
    model: Optional[str] = None
) -> None:
    """Override the AI provider for the next review (per-request configuration)."""
    global _AI_OVERRIDE
    _AI_OVERRIDE = {'provider': provider, 'api_key': api_key, 'model': model}


def _resolve_keys() -> List[str]:
    """Configured API keys in failover order (AI_API_KEY may be comma-separated)."""
    raw = _AI_OVERRIDE.get('api_key') or AI_API_KEY or ''
    return [key.strip() for key in raw.split(',') if key.strip()]


def _get_clients() -> List[AsyncOpenAI]:
    """One OpenAI-compatible client per configured key, cached per provider+keys."""
    provider = _AI_OVERRIDE.get('provider') or AI_PROVIDER
    keys = _resolve_keys()
    if not keys:
        return []

    signature = (provider, tuple(keys))
    if signature not in _clients_cache:
        # Keep the cache tiny: only the active provider/key set matters.
        _clients_cache.clear()
        _clients_cache[signature] = [
            AsyncOpenAI(api_key=key, base_url=AI_BASE_URLS.get(provider))
            for key in keys
        ]
    return _clients_cache[signature]


def _is_key_rotation_error(error: Exception) -> bool:
    """429 (quota) and 401/403 (invalid key) mean: try the next configured key."""
    status = getattr(error, 'status_code', None)
    if status in (401, 403, 429):
        return True
    text = str(error)
    return any(code in text for code in ('Error code: 401', 'Error code: 403', 'Error code: 429'))


async def _create_completion(**kwargs):
    """Run a chat completion, rotating to the next API key on quota/auth errors.

    The last successful key is remembered so subsequent calls skip exhausted
    keys instead of paying the rejection on every judge.
    """
    global _preferred_key_index
    clients = _get_clients()
    if not clients:
        return None

    start = _preferred_key_index % len(clients)
    order = list(range(start, len(clients))) + list(range(0, start))
    last_error: Optional[Exception] = None

    async with _COMPLETION_SEMAPHORE:
        for index in order:
            try:
                result = await clients[index].chat.completions.create(**kwargs)
                _preferred_key_index = index
                return result
            except Exception as error:
                if not _is_key_rotation_error(error):
                    raise
                last_error = error
                print(
                    f"[Council] key #{index + 1} rejected "
                    f"({getattr(error, 'status_code', '?')}); trying next key"
                )

    if last_error:
        raise last_error
    return None


def _resolve_model(role: Optional[JudgeRole] = None) -> str:
    """Pick the judge model: request override, per-role env, then global AI_MODEL."""
    override_model = _AI_OVERRIDE.get('model')
    if override_model:
        return override_model
    if role is not None:
        role_model = os.getenv(f"COUNCIL_{role.value.upper()}_MODEL")
        if role_model:
            return role_model
    return AI_MODEL


class JudgeRole(Enum):
    STYLOMETRIC_LINGUIST = "stylometric_linguist"
    FORENSIC_HISTORIAN = "forensic_historian"
    ATTRIBUTION_SCHOLAR = "attribution_scholar"
    PARAPHRASE_DETECTIVE = "paraphrase_detective"
    SYNTHESIZER_ARBITER = "synthesizer_arbiter"


@dataclass
class CouncilConfig:
    """Configuration for the AI Council."""
    judges: List[str]
    min_quorum: int = 3
    # Free tiers (e.g. NVIDIA NIM) queue concurrent calls, so a judge can take
    # far longer than its generation time. Override with
    # COUNCIL_JUDGE_TIMEOUT_SECONDS when the provider is faster or slower.
    timeout_seconds: int = int(os.getenv("COUNCIL_JUDGE_TIMEOUT_SECONDS", "30"))
    max_rounds: int = 2


@dataclass
class JudgeEvaluation:
    """Evaluation from a single judge."""
    judge_role: JudgeRole
    match_id: str
    verdict: str  # 'plagiarism', 'paraphrasing', 'uncited_fact', 'original', 'inconclusive'
    confidence: float
    reasoning: str
    evidence: List[str]
    severity: str  # 'low', 'medium', 'high', 'critical'
    timestamp: str


@dataclass
class CouncilVerdict:
    """Final synthesized verdict from the Council."""
    match_id: str
    final_verdict: str
    overall_confidence: float
    active_judges: int
    quorum_reached: bool
    deliberation_transcript: List[Dict[str, Any]]
    final_reasoning: str
    recommended_action: str


# ─── Judge Prompts ───

JUDGE_PROMPTS = {
    JudgeRole.STYLOMETRIC_LINGUIST: """You are Judge 1: The Stylometric Linguist.
Your expertise: Voice consistency, sentence rhythm, burstiness & perplexity analysis.
You detect sudden shifts from informal prose to hyper-dense professorial language.

Evaluate the SUSPECT TEXT against the SOURCE TEXT for stylometric anomalies.
Consider: vocabulary richness, sentence length variation, function word patterns, syntactic complexity.

Return JSON:
{
  "verdict": "plagiarism|paraphrasing|uncited_fact|original|inconclusive",
  "confidence": 0.0-1.0,
  "reasoning": "detailed linguistic analysis",
  "evidence": ["specific linguistic markers found"],
  "severity": "low|medium|high|critical"
}""",

    JudgeRole.FORENSIC_HISTORIAN: """You are Judge 2: The Forensic Historian.
Your expertise: Keystroke forensics, composition timeline analysis, copy-paste detection.
You analyze Redis composition logs: did the student author this organically over hours, or paste 1,000 words in 1 second?

Evaluate the COMPOSITION TIMELINE for the SUSPECT TEXT.
Consider: typing patterns, paste events, composition duration, backspace ratios, session continuity.

Return JSON:
{
  "verdict": "plagiarism|paraphrasing|uncited_fact|original|inconclusive",
  "confidence": 0.0-1.0,
  "reasoning": "detailed forensic timeline analysis",
  "evidence": ["specific timeline anomalies or confirmations"],
  "severity": "low|medium|high|critical"
}""",

    JudgeRole.ATTRIBUTION_SCHOLAR: """You are Judge 3: The Attribution Scholar.
Your expertise: Fact verification, citation legitimacy, APA/IEEE standards compliance.
You identify factual assertions and statistical claims lacking reference tags.

Evaluate the SUSPECT TEXT for uncited factual claims and statistical assertions.
Consider: specific numbers, study findings, definitive claims, literature summaries without citations.

Return JSON:
{
  "verdict": "plagiarism|paraphrasing|uncited_fact|original|inconclusive",
  "confidence": 0.0-1.0,
  "reasoning": "detailed attribution analysis",
  "evidence": ["specific uncited claims or properly cited passages"],
  "severity": "low|medium|high|critical"
}""",

    JudgeRole.PARAPHRASE_DETECTIVE: """You are Judge 4: The Paraphrase Detective.
Your expertise: Thesaurus churning, patchwriting, sentence reordering, structural mimicry.
You catch "smart cheating" where synonyms are swapped to bypass basic string matchers.

Evaluate the SUSPECT TEXT against the SOURCE TEXT for paraphrasing strategies.
Consider: synonym substitution density, sentence structure preservation, idea sequence preservation, patchwriting patterns.

Return JSON:
{
  "verdict": "plagiarism|paraphrasing|uncited_fact|original|inconclusive",
  "confidence": 0.0-1.0,
  "reasoning": "detailed paraphrase analysis",
  "evidence": ["specific paraphrase techniques detected"],
  "severity": "low|medium|high|critical"
}""",

    JudgeRole.SYNTHESIZER_ARBITER: """You are Judge 5: The Synthesizer & Arbiter.
Your expertise: Cross-examination mediation, consensus synthesis, hallucination elimination.
You reconcile conflicting opinions, eliminate hallucinations, and write the Council Decision.

You receive evaluations from 4 other judges. Your job:
1. Identify agreements and conflicts
2. Challenge weak reasoning
3. Synthesize a final consensus
4. Write the Council Decision transcript

Return JSON:
{
  "final_verdict": "plagiarism|paraphrasing|uncited_fact|original|inconclusive",
  "overall_confidence": 0.0-1.0,
  "active_judges": 5,
  "quorum_reached": true,
  "deliberation_transcript": [
    {"judge": "Stylometric Linguist", "position": "...", "challenge": "..."},
    {"judge": "Forensic Historian", "position": "...", "challenge": "..."},
    ...
  ],
  "final_reasoning": "synthesized consensus reasoning",
  "recommended_action": "flag_for_review|require_citation|clear|escalate"
}"""
}


class CouncilJudge:
    """Individual AI Judge with specialized persona."""
    
    def __init__(self, role: JudgeRole, model: str = None):
        self.role = role
        self.model = model or _resolve_model(role)
        self.prompt = JUDGE_PROMPTS[role]
    
    async def evaluate(self, match_data: Dict[str, Any], timeout: int = 8) -> Optional[JudgeEvaluation]:
        """Evaluate a match and return judgment."""
        if not _get_clients():
            print(f"[Council] {self.role.value}: no AI provider configured")
            return None
        try:
            prompt = self._build_prompt(match_data)
            
            response = await asyncio.wait_for(
                _create_completion(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": self.prompt},
                        {"role": "user", "content": prompt}
                    ],
                    temperature=0.1,
                    response_format={"type": "json_object"}
                ),
                timeout=timeout
            )
            if response is None:
                return None
            
            content = response.choices[0].message.content
            result = json.loads(content)
            
            return JudgeEvaluation(
                judge_role=self.role,
                match_id=match_data.get('match_id', ''),
                verdict=result.get('verdict', 'inconclusive'),
                confidence=float(result.get('confidence', 0.5)),
                reasoning=result.get('reasoning', ''),
                evidence=result.get('evidence', []),
                severity=result.get('severity', 'medium'),
                timestamp=datetime.utcnow().isoformat()
            )
        except asyncio.TimeoutError:
            print(f"[Council] {self.role.value} timed out")
            return None
        except Exception as e:
            print(f"[Council] {self.role.value} error: {e}")
            return None
    
    def _build_prompt(self, match_data: Dict[str, Any]) -> str:
        """Build the evaluation prompt for this judge."""
        context = f"""MATCH ID: {match_data.get('match_id', 'unknown')}
SUSPECT TEXT:
{match_data.get('suspect_text', '')}

SOURCE TEXT:
{match_data.get('source_text', '')}

SIMILARITY SCORE: {match_data.get('similarity_score', 'N/A')}
MATCH TYPE: {match_data.get('match_type', 'unknown')}

COMPOSITION TIMELINE:
{json.dumps(match_data.get('composition_timeline', {}), indent=2)}

EXTERNAL SOURCES CHECKED:
{json.dumps(match_data.get('external_sources', []), indent=2)}"""
        
        return f"{self.prompt}\n\nEVALUATION CONTEXT:\n{context}\n\nReturn ONLY valid JSON."


class AICouncil:
    """Orchestrates the 5-Judge Council with dynamic quorum handling."""
    
    def __init__(self, config: CouncilConfig = None):
        self.config = config or CouncilConfig(
            judges=[j.value for j in JudgeRole],
            min_quorum=3
        )
        self.judges = {role: CouncilJudge(role) for role in JudgeRole}
    
    async def deliberate(self, match_data: Dict[str, Any]) -> CouncilVerdict:
        """
        Run the full Council deliberation process.
        Round 1: Parallel evaluation by all judges
        Round 2: Synthesizer cross-examines and synthesizes
        """
        print(f"[Council] Starting deliberation for match {match_data.get('match_id')}")
        
        # Round 1: Parallel evaluation by 4 specialist judges
        specialist_roles = [
            JudgeRole.STYLOMETRIC_LINGUIST,
            JudgeRole.FORENSIC_HISTORIAN,
            JudgeRole.ATTRIBUTION_SCHOLAR,
            JudgeRole.PARAPHRASE_DETECTIVE
        ]
        
        evaluations = await self._run_round(match_data, specialist_roles)
        
        # Check quorum
        active_evaluations = [e for e in evaluations if e is not None]
        if len(active_evaluations) < self.config.min_quorum:
            return CouncilVerdict(
                match_id=match_data.get('match_id', ''),
                final_verdict='inconclusive',
                overall_confidence=0.0,
                active_judges=len(active_evaluations),
                quorum_reached=False,
                deliberation_transcript=[],
                final_reasoning=f"Quorum failed: only {len(active_evaluations)} of {len(specialist_roles)} judges responded",
                recommended_action='manual_review'
            )
        
        # Round 2: Synthesizer cross-examines and synthesizes
        synthesizer = self.judges[JudgeRole.SYNTHESIZER_ARBITER]
        synthesis_prompt = self._build_synthesis_prompt(match_data, active_evaluations)
        synth_client_available = bool(_get_clients())
        if not synth_client_available:
            return self._fallback_verdict(match_data, active_evaluations)

        try:
            response = await asyncio.wait_for(
                _create_completion(
                    model=synthesizer.model,
                    messages=[
                        {"role": "system", "content": synthesizer.prompt},
                        {"role": "user", "content": synthesis_prompt}
                    ],
                    temperature=0.1,
                    response_format={"type": "json_object"}
                ),
                timeout=self.config.timeout_seconds
            )
            if response is None:
                return self._fallback_verdict(match_data, active_evaluations)
            
            synthesis = json.loads(response.choices[0].message.content)
            
            # Build full transcript
            transcript = self._build_transcript(active_evaluations, synthesis)
            
            return CouncilVerdict(
                match_id=match_data.get('match_id', ''),
                final_verdict=synthesis.get('final_verdict', 'inconclusive'),
                overall_confidence=float(synthesis.get('overall_confidence', 0.5)),
                active_judges=len(active_evaluations) + 1,  # +1 for synthesizer
                quorum_reached=True,
                deliberation_transcript=transcript,
                final_reasoning=synthesis.get('final_reasoning', ''),
                recommended_action=synthesis.get('recommended_action', 'flag_for_review')
            )
        except Exception as e:
            print(f"[Council] Synthesis failed: {e}")
            # Fallback: simple majority vote
            return self._fallback_verdict(match_data, active_evaluations)
    
    async def _run_round(self, match_data: Dict[str, Any], roles: List[JudgeRole]) -> List[Optional[JudgeEvaluation]]:
        """Run parallel evaluation by specified judges."""
        tasks = [
            self.judges[role].evaluate(match_data, timeout=self.config.timeout_seconds)
            for role in roles
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        evaluations = []
        for role, result in zip(roles, results):
            if isinstance(result, JudgeEvaluation):
                evaluations.append(result)
            else:
                print(f"[Council] {role.value} failed: {result}")
                evaluations.append(None)
        
        return evaluations
    
    def _build_synthesis_prompt(self, match_data: Dict[str, Any], evaluations: List[JudgeEvaluation]) -> str:
        """Build the synthesis prompt for the Arbiter."""
        eval_summaries = []
        for e in evaluations:
            if e:
                eval_summaries.append(f"- {e.judge_role.value}: {e.verdict} (confidence: {e.confidence:.2f}) - {e.reasoning[:200]}")
        
        return f"""MATCH ID: {match_data.get('match_id')}

SPECIALIST EVALUATIONS:
{chr(10).join(eval_summaries)}

ORIGINAL CONTEXT:
SUSPECT TEXT: {match_data.get('suspect_text', '')[:500]}
SOURCE TEXT: {match_data.get('source_text', '')[:500]}
SIMILARITY: {match_data.get('similarity_score')}

SYNTHESIS TASK:
1. Identify agreements and conflicts among judges
2. Challenge any weak reasoning or low-confidence verdicts
3. Synthesize a final consensus verdict
4. Provide the final deliberation transcript

Return JSON with: final_verdict, overall_confidence, deliberation_transcript, final_reasoning, recommended_action"""
    
    def _build_transcript(self, evaluations: List[JudgeEvaluation], synthesis: Dict) -> List[Dict]:
        """Build the full deliberation transcript."""
        transcript = []
        for e in evaluations:
            if e:
                transcript.append({
                    "judge": e.judge_role.value.replace('_', ' ').title(),
                    "verdict": e.verdict,
                    "confidence": e.confidence,
                    "reasoning": e.reasoning,
                    "evidence": e.evidence,
                    "severity": e.severity
                })
        
        transcript.append({
            "judge": "Synthesizer Arbiter",
            "verdict": synthesis.get('final_verdict'),
            "confidence": synthesis.get('overall_confidence'),
            "reasoning": synthesis.get('final_reasoning'),
            "synthesis": True
        })
        
        return transcript
    
    def _fallback_verdict(self, match_data: Dict[str, Any], evaluations: List[JudgeEvaluation]) -> CouncilVerdict:
        """Fallback: simple majority vote when synthesis fails."""
        valid = [e for e in evaluations if e]
        if not valid:
            return CouncilVerdict(
                match_id=match_data.get('match_id', ''),
                final_verdict='inconclusive',
                overall_confidence=0.0,
                active_judges=0,
                quorum_reached=False,
                deliberation_transcript=[],
                final_reasoning="All judges failed",
                recommended_action='manual_review'
            )
        
        # Count verdicts
        verdict_counts = {}
        for e in valid:
            verdict_counts[e.verdict] = verdict_counts.get(e.verdict, 0) + 1
        
        final_verdict = max(verdict_counts, key=verdict_counts.get)
        avg_confidence = sum(e.confidence for e in valid) / len(valid)
        
        return CouncilVerdict(
            match_id=match_data.get('match_id', ''),
            final_verdict=final_verdict,
            overall_confidence=avg_confidence,
            active_judges=len(valid),
            quorum_reached=len(valid) >= self.config.min_quorum,
            deliberation_transcript=[{
                "judge": e.judge_role.value.replace('_', ' ').title(),
                "verdict": e.verdict,
                "confidence": e.confidence,
                "reasoning": e.reasoning
            } for e in valid],
            final_reasoning=f"Fallback majority vote: {final_verdict} ({verdict_counts.get(final_verdict, 0)}/{len(valid)} judges)",
            recommended_action='flag_for_review'
        )


# ─── High-level pipeline ───

async def run_council_review(
    suspect_text: str,
    source_text: str,
    similarity_score: float,
    match_type: str,
    match_id: str,
    composition_timeline: Dict = None,
    external_sources: List = None
) -> CouncilVerdict:
    """
    High-level function to run the full Council review on a match.
    """
    council = AICouncil()
    
    match_data = {
        'match_id': match_id,
        'suspect_text': suspect_text,
        'source_text': source_text,
        'similarity_score': similarity_score,
        'match_type': match_type,
        'composition_timeline': composition_timeline or {},
        'external_sources': external_sources or []
    }
    
    return await council.deliberate(match_data)


# CLI for testing
async def main():
    test_match = {
        'match_id': 'test-001',
        'suspect_text': 'The methodology chapter describes the experimental design in detail, including the participant recruitment process and data collection procedures.',
        'source_text': 'The methodology chapter describes the experimental design in detail, including the participant recruitment process and data collection procedures.',
        'similarity_score': 1.0,
        'match_type': 'verbatim',
        'match_id': 'test-001',
        'composition_timeline': {
            'events': [
                {'action': 'paste', 'text_length': 245, 'timestamp': '2024-01-15T14:30:00Z'},
                {'action': 'type', 'text_length': 12, 'timestamp': '2024-01-15T14:30:05Z'}
            ]
        }
    }
    
    verdict = await run_council_review(**test_match)
    print(json.dumps(asdict(verdict), indent=2, default=str))


if __name__ == '__main__':
    asyncio.run(main())