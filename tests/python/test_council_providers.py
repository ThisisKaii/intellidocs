"""The council can run each judge on a different AI provider, with failover."""
import asyncio
import json
from types import SimpleNamespace

import pytest

import council_pipeline as cp
from council_pipeline import JudgeRole


PROFILES = [
    {"provider": "gemini", "api_key": "g-key", "model": "gemini-2.5-flash"},
    {"provider": "nvidia", "api_key": "n-key", "model": "deepseek-ai/deepseek-r1"},
    {"provider": "nvidia", "api_key": "n-key2", "model": "meta/llama-3.2-11b-vision-instruct"},
]

VERDICT = {"verdict": "plagiarism", "confidence": 0.9, "reasoning": "copied", "evidence": ["x"], "severity": "high"}
SYNTHESIS = {
    "final_verdict": "plagiarism", "overall_confidence": 0.88,
    "final_reasoning": "agreed", "recommended_action": "flag_for_review",
}
MATCH = {"match_id": "m1", "suspect_text": "a", "source_text": "a", "similarity_score": 1.0, "match_type": "verbatim"}


def run(coro):
    return asyncio.run(coro)


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    for name in list(__import__("os").environ):
        if name.startswith(("COUNCIL_", "AI_PROVIDER_", "AI_MODEL_", "AI_API_KEY_")):
            monkeypatch.delenv(name, raising=False)


def first_provider_models(role):
    return [p.model for p in cp._profile_order(role)]


class TestAssignments:
    def test_specialists_spread_round_robin_and_arbiter_uses_first(self):
        async def go():
            cp.configure_ai(profiles=PROFILES)
            return {role: cp._profile_order(role)[0].model for role in JudgeRole}

        result = run(go())
        assert result[JudgeRole.STYLOMETRIC_LINGUIST] == "gemini-2.5-flash"
        assert result[JudgeRole.FORENSIC_HISTORIAN] == "deepseek-ai/deepseek-r1"
        assert result[JudgeRole.ATTRIBUTION_SCHOLAR] == "meta/llama-3.2-11b-vision-instruct"
        assert result[JudgeRole.PARAPHRASE_DETECTIVE] == "gemini-2.5-flash"
        assert result[JudgeRole.SYNTHESIZER_ARBITER] == "gemini-2.5-flash"

    def test_failover_order_lists_every_profile_once(self):
        async def go():
            cp.configure_ai(profiles=PROFILES)
            return first_provider_models(JudgeRole.FORENSIC_HISTORIAN)

        assert run(go()) == ["deepseek-ai/deepseek-r1", "gemini-2.5-flash", "meta/llama-3.2-11b-vision-instruct"]

    def test_request_assignments_and_env_pins(self, monkeypatch):
        monkeypatch.setenv("COUNCIL_PARAPHRASE_DETECTIVE_PROFILE", "3")

        async def go():
            cp.configure_ai(profiles=PROFILES, assignments={"synthesizer_arbiter": 1})
            return (
                cp._profile_order(JudgeRole.SYNTHESIZER_ARBITER)[0].model,
                cp._profile_order(JudgeRole.PARAPHRASE_DETECTIVE)[0].model,
            )

        assert run(go()) == ("deepseek-ai/deepseek-r1", "meta/llama-3.2-11b-vision-instruct")

    def test_legacy_single_provider_triple_still_works(self):
        async def go():
            cp.configure_ai(provider="gemini", api_key="k1,k2", model="gemini-2.5-flash")
            return [(p.provider, p.api_keys, p.model) for p in cp._active_profiles()]

        assert run(go()) == [("gemini", ["k1", "k2"], "gemini-2.5-flash")]

    def test_concurrent_scans_do_not_share_configuration(self):
        async def scan(model):
            cp.configure_ai(profiles=[{"provider": "nvidia", "api_key": "k", "model": model}])
            await asyncio.sleep(0.01)
            return cp._active_profiles()[0].model

        async def go():
            return await asyncio.gather(scan("model-a"), scan("model-b"))

        assert run(go()) == ["model-a", "model-b"]


class TestJsonParsing:
    def test_plain_fenced_and_chatty_answers(self):
        assert cp._parse_json('{"a": 1}') == {"a": 1}
        assert cp._parse_json('```json\n{"a": 2}\n```') == {"a": 2}
        assert cp._parse_json('Sure! Here you go: {"a": 3} hope that helps') == {"a": 3}

    def test_deepseek_think_block_is_ignored(self):
        text = '<think>the user wants {"fake": true} json</think>\n{"verdict": "original"}'
        assert cp._parse_json(text) == {"verdict": "original"}

    def test_garbage_raises(self):
        with pytest.raises(json.JSONDecodeError):
            cp._parse_json("no json here")


class TestCompletionFallbacks:
    def test_retries_without_response_format_when_rejected(self, monkeypatch):
        calls = []

        async def fake_create(profile, **kwargs):
            calls.append("response_format" in kwargs)
            if "response_format" in kwargs:
                raise SimpleNamespace_error(400)
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="{}"))])

        monkeypatch.setattr(cp, "_create_completion", fake_create)
        profile = cp.AIProfile("nvidia", "m", ["k"])
        assert run(cp._complete_json(profile, "m", "sys", "user")) == "{}"
        assert calls == [True, False]


def SimpleNamespace_error(status):
    error = RuntimeError(f"Error code: {status}")
    error.status_code = status
    return error


class TestJudgeFailover:
    def test_judge_falls_over_to_the_next_provider(self, monkeypatch):
        attempts = []

        async def fake_complete(profile, model, system, user):
            attempts.append(profile.provider)
            if profile.provider == "gemini":
                raise SimpleNamespace_error(503)
            return json.dumps(VERDICT)

        monkeypatch.setattr(cp, "_complete_json", fake_complete)

        async def go():
            cp.configure_ai(profiles=PROFILES[:2])
            return await cp.CouncilJudge(JudgeRole.STYLOMETRIC_LINGUIST).evaluate(MATCH, timeout=5)

        result = run(go())
        assert attempts == ["gemini", "nvidia"]
        assert (result.provider, result.model) == ("nvidia", "deepseek-ai/deepseek-r1")

    def test_judge_returns_none_when_every_provider_fails(self, monkeypatch):
        async def fake_complete(profile, model, system, user):
            raise SimpleNamespace_error(500)

        monkeypatch.setattr(cp, "_complete_json", fake_complete)

        async def go():
            cp.configure_ai(profiles=PROFILES[:2])
            return await cp.CouncilJudge(JudgeRole.FORENSIC_HISTORIAN).evaluate(MATCH, timeout=5)

        assert run(go()) is None

    def test_no_provider_configured_returns_none(self, monkeypatch):
        monkeypatch.setattr(cp, "_env_profiles", lambda: [])

        async def go():
            cp.configure_ai()
            return await cp.CouncilJudge(JudgeRole.STYLOMETRIC_LINGUIST).evaluate(MATCH, timeout=5)

        assert run(go()) is None


class TestMixedPanel:
    def test_transcript_records_the_model_behind_every_judge(self, monkeypatch):
        async def fake_complete(profile, model, system, user):
            return json.dumps(SYNTHESIS if "SPECIALIST EVALUATIONS" in user else VERDICT)

        monkeypatch.setattr(cp, "_complete_json", fake_complete)

        async def go():
            cp.configure_ai(profiles=PROFILES)
            return await cp.AICouncil().deliberate(MATCH)

        verdict = run(go())
        assert verdict.quorum_reached and verdict.active_judges == 5
        models = {entry["model"] for entry in verdict.deliberation_transcript}
        assert models == {"gemini-2.5-flash", "deepseek-ai/deepseek-r1", "meta/llama-3.2-11b-vision-instruct"}
        arbiter = verdict.deliberation_transcript[-1]
        assert arbiter["synthesis"] and arbiter["provider"] == "gemini"

    def test_quorum_survives_one_provider_being_down(self, monkeypatch):
        async def fake_complete(profile, model, system, user):
            if profile.provider == "gemini":
                raise SimpleNamespace_error(503)
            return json.dumps(SYNTHESIS if "SPECIALIST EVALUATIONS" in user else VERDICT)

        monkeypatch.setattr(cp, "_complete_json", fake_complete)

        async def go():
            cp.configure_ai(profiles=PROFILES[:2])
            return await cp.AICouncil().deliberate(MATCH)

        verdict = run(go())
        assert verdict.quorum_reached
        assert {entry["provider"] for entry in verdict.deliberation_transcript} == {"nvidia"}
