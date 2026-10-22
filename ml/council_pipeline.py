"""
IntelliDocs ML Service — Multi-Agent AI Council for Plagiarism Detection
Implements the 5-Judge Council with specialized academic personas.
"""

import os
import re
import json
import asyncio
import contextvars
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict
from datetime import datetime
from enum import Enum

from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()

class JudgeRole(Enum):
    STYLOMETRIC_LINGUIST = "stylometric_linguist"
    FORENSIC_HISTORIAN = "forensic_historian"
    ATTRIBUTION_SCHOLAR = "attribution_scholar"
    PARAPHRASE_DETECTIVE = "paraphrase_detective"
    SYNTHESIZER_ARBITER = "synthesizer_arbiter"


# AI Provider Configuration. Profile 1 is AI_PROVIDER / AI_MODEL / AI_API_KEY;
# profiles 2..9 use the same names with a numeric suffix (AI_PROVIDER_2, ...).
AI_PROVIDER = os.getenv("AI_PROVIDER", "openrouter")
AI_API_KEY = os.getenv("AI_API_KEY")
AI_MODEL = os.getenv("AI_MODEL", "openrouter/auto")
MAX_PROFILES = 9

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


@dataclass
class AIProfile:
    """One AI backend a judge can run on: provider, model, and rotating API keys."""
    provider: str
    model: str
    api_keys: List[str]


def _split_keys(raw: Optional[str]) -> List[str]:
    """Split a comma-separated key list into trimmed, non-empty keys."""
    return [key.strip() for key in (raw or '').split(',') if key.strip()]


# Request-scoped AI configuration. A ContextVar (not a module global) keeps
# concurrent scans from overwriting each other, and is inherited by the
# asyncio tasks each scan spawns.
_AI_CONTEXT: "contextvars.ContextVar[Optional[Dict[str, Any]]]" = contextvars.ContextVar(
    'council_ai_context', default=None
)
_clients_cache: Dict[tuple, AsyncOpenAI] = {}
_preferred_key_index: Dict[tuple, int] = {}
_completion_semaphores: Dict[str, asyncio.Semaphore] = {}
# Free tiers queue concurrent completions; at most two per provider at a time
# keeps the parallel judges inside their per-call timeout on a single key.
_COMPLETIONS_PER_PROVIDER = 2


def configure_ai(
    provider: Optional[str] = None,
    api_key: Optional[str] = None,
    model: Optional[str] = None,
    profiles: Optional[List[Dict[str, Any]]] = None,
    assignments: Optional[Dict[str, int]] = None,
) -> None:
    """Set the AI configuration for the current request.

    Either a list of profiles (each {provider, api_key, model}) with optional
    per-role assignments, or the legacy single provider/api_key/model triple.
    """
    if profiles:
        built = [
            AIProfile(
                provider=str(p.get('provider') or AI_PROVIDER),
                model=str(p.get('model') or AI_MODEL),
                api_keys=_split_keys(p.get('api_key')),
            )
            for p in profiles
        ]
    elif provider or api_key or model:
        built = [AIProfile(provider or AI_PROVIDER, model or AI_MODEL, _split_keys(api_key or AI_API_KEY))]
    else:
        built = []
    _AI_CONTEXT.set({
        'profiles': [p for p in built if p.api_keys],
        'assignments': dict(assignments or {}),
    })


def _env_profiles() -> List[AIProfile]:
    """Profiles from the environment: AI_* then AI_*_2 ... AI_*_9 (incomplete ones skipped)."""
    profiles: List[AIProfile] = []
    for n in range(1, MAX_PROFILES + 1):
        suffix = '' if n == 1 else f'_{n}'
        provider = os.getenv(f'AI_PROVIDER{suffix}') or (AI_PROVIDER if n == 1 else None)
        model = os.getenv(f'AI_MODEL{suffix}') or (AI_MODEL if n == 1 else None)
        keys = _split_keys(os.getenv(f'AI_API_KEY{suffix}'))
        if provider and model and keys:
            profiles.append(AIProfile(provider.strip().lower(), model.strip(), keys))
    return profiles


def _active_profiles() -> List[AIProfile]:
    """The request's profiles, or the environment's when the request sent none."""
    context = _AI_CONTEXT.get()
    if context and context['profiles']:
        return context['profiles']
    return _env_profiles()


def _get_client(provider: str, api_key: str) -> AsyncOpenAI:
    """One OpenAI-compatible client per (provider, key), cached."""
    signature = (provider, api_key)
    if signature not in _clients_cache:
        _clients_cache[signature] = AsyncOpenAI(api_key=api_key, base_url=AI_BASE_URLS.get(provider))
    return _clients_cache[signature]


def _is_key_rotation_error(error: Exception) -> bool:
    """429 (quota) and 401/403 (invalid key) mean: try the next configured key."""
    status = getattr(error, 'status_code', None)
    if status in (401, 403, 429):
        return True
    text = str(error)
    return any(code in text for code in ('Error code: 401', 'Error code: 403', 'Error code: 429'))


def _is_bad_request(error: Exception) -> bool:
    """400 means the provider rejected a parameter (e.g. response_format)."""
    return getattr(error, 'status_code', None) == 400 or 'Error code: 400' in str(error)


async def _create_completion(profile: AIProfile, **kwargs):
    """Run a chat completion on one profile, rotating its API keys on quota/auth errors.

    The last successful key is remembered so subsequent calls skip exhausted
    keys instead of paying the rejection on every judge.
    """
    if not profile.api_keys:
        return None

    signature = (profile.provider, tuple(profile.api_keys))
    start = _preferred_key_index.get(signature, 0) % len(profile.api_keys)
    order = list(range(start, len(profile.api_keys))) + list(range(0, start))
    semaphore = _completion_semaphores.setdefault(
        profile.provider, asyncio.Semaphore(_COMPLETIONS_PER_PROVIDER)
    )
    last_error: Optional[Exception] = None

    async with semaphore:
        for index in order:
            try:
                result = await _get_client(profile.provider, profile.api_keys[index]).chat.completions.create(**kwargs)
                _preferred_key_index[signature] = index
                return result
            except Exception as error:
                if not _is_key_rotation_error(error):
                    raise
                last_error = error
                print(
                    f"[Council] {profile.provider} key #{index + 1} rejected "
                    f"({getattr(error, 'status_code', '?')}); trying next key"
                )

    if last_error:
        raise last_error
    return None


async def _complete_json(profile: AIProfile, model: str, system: str, user: str) -> Optional[str]:
    """Ask a profile for a JSON answer; retry without response_format if it rejects the parameter."""
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    try:
        response = await _create_completion(
            profile, model=model, messages=messages, temperature=0.1,
            response_format={"type": "json_object"},
        )
    except Exception as error:
        if not _is_bad_request(error):
            raise
        response = await _create_completion(profile, model=model, messages=messages, temperature=0.1)
    if response is None:
        return None
    return response.choices[0].message.content


def _parse_json(text: Optional[str]) -> Dict[str, Any]:
    """Parse a model's JSON answer, tolerating <think> blocks, code fences and chatter."""
    cleaned = re.sub(r'<think>.*?</think>', '', text or '', flags=re.DOTALL).strip()
    fence = re.search(r'```(?:json)?\s*(.*?)```', cleaned, flags=re.DOTALL)
    if fence:
        cleaned = fence.group(1).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start, end = cleaned.find('{'), cleaned.rfind('}')
        if start != -1 and end > start:
            return json.loads(cleaned[start:end + 1])
        raise



SPECIALIST_ROLES = [
    JudgeRole.STYLOMETRIC_LINGUIST,
    JudgeRole.FORENSIC_HISTORIAN,
    JudgeRole.ATTRIBUTION_SCHOLAR,
    JudgeRole.PARAPHRASE_DETECTIVE,
]


def _assigned_index(role: "JudgeRole", count: int) -> int:
    """Which profile (0-based) a judge tries first.

    Order of precedence: the request's assignment, COUNCIL_<ROLE>_PROFILE (1-based),
    then the default - specialists spread round-robin, the arbiter on profile 1.
    """
    context = _AI_CONTEXT.get() or {}
    requested = (context.get('assignments') or {}).get(role.value)
    if isinstance(requested, int) and 0 <= requested < count:
        return requested
    try:
        pinned = int(os.getenv(f"COUNCIL_{role.value.upper()}_PROFILE", ""))
        if 1 <= pinned <= count:
            return pinned - 1
    except ValueError:
        pass
    if role in SPECIALIST_ROLES:
        return SPECIALIST_ROLES.index(role) % count
    return 0


def _profile_order(role: "JudgeRole") -> List[AIProfile]:
    """Profiles for a judge: its assigned one first, then the rest as failover."""
    profiles = _active_profiles()
    if not profiles:
        return []
    first = _assigned_index(role, len(profiles))
    return [profiles[first]] + [p for i, p in enumerate(profiles) if i != first]


def _model_for(role: "JudgeRole", profile: AIProfile, primary: bool) -> str:
    """Model for a judge on a profile: COUNCIL_<ROLE>_MODEL pins the primary attempt, else the profile's model."""
    if primary:
        pinned = os.getenv(f"COUNCIL_{role.value.upper()}_MODEL")
        if pinned:
            return pinned
    return profile.model


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
    provider: str = ''
    model: str = ''


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
        self.model = model  # optional hard override; otherwise chosen per profile
        self.prompt = JUDGE_PROMPTS[role]

    async def evaluate(self, match_data: Dict[str, Any], timeout: int = 8) -> Optional[JudgeEvaluation]:
        """Evaluate a match on the assigned profile, failing over to the others."""
        profiles = _profile_order(self.role)
        if not profiles:
            print(f"[Council] {self.role.value}: no AI provider configured")
            return None

        prompt = self._build_prompt(match_data)
        for attempt, profile in enumerate(profiles):
            model = self.model or _model_for(self.role, profile, primary=attempt == 0)
            try:
                content = await asyncio.wait_for(
                    _complete_json(profile, model, self.prompt, prompt),
                    timeout=timeout,
                )
                if content is None:
                    continue
                result = _parse_json(content)
                return JudgeEvaluation(
                    judge_role=self.role,
                    match_id=match_data.get('match_id', ''),
                    verdict=result.get('verdict', 'inconclusive'),
                    confidence=float(result.get('confidence', 0.5)),
                    reasoning=result.get('reasoning', ''),
                    evidence=result.get('evidence', []),
                    severity=result.get('severity', 'medium'),
                    timestamp=datetime.utcnow().isoformat(),
                    provider=profile.provider,
                    model=model,
                )
            except asyncio.TimeoutError:
                print(f"[Council] {self.role.value} timed out on {profile.provider}/{model}")
            except Exception as e:
                print(f"[Council] {self.role.value} error on {profile.provider}/{model}: {e}")
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
        profiles = _profile_order(JudgeRole.SYNTHESIZER_ARBITER)
        if not profiles:
            return self._fallback_verdict(match_data, active_evaluations)

        for attempt, profile in enumerate(profiles):
            model = synthesizer.model or _model_for(JudgeRole.SYNTHESIZER_ARBITER, profile, primary=attempt == 0)
            try:
                content = await asyncio.wait_for(
                    _complete_json(profile, model, synthesizer.prompt, synthesis_prompt),
                    timeout=self.config.timeout_seconds,
                )
                if content is None:
                    continue
                synthesis = _parse_json(content)
                transcript = self._build_transcript(active_evaluations, synthesis, profile.provider, model)
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
                print(f"[Council] Synthesis failed on {profile.provider}/{model}: {e}")

        # Every profile failed: simple majority vote
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
    
    def _build_transcript(
        self,
        evaluations: List[JudgeEvaluation],
        synthesis: Dict,
        synth_provider: str = '',
        synth_model: str = '',
    ) -> List[Dict]:
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
                    "severity": e.severity,
                    "provider": e.provider,
                    "model": e.model
                })
        
        transcript.append({
            "judge": "Synthesizer Arbiter",
            "verdict": synthesis.get('final_verdict'),
            "confidence": synthesis.get('overall_confidence'),
            "reasoning": synthesis.get('final_reasoning'),
            "synthesis": True,
            "provider": synth_provider,
            "model": synth_model
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
                "reasoning": e.reasoning,
                "provider": e.provider,
                "model": e.model
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