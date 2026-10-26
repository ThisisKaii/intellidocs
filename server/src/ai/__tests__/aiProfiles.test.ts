import { getAIProfiles, resolveJudgeAssignments } from '../aiProfiles'

const BASE: NodeJS.ProcessEnv = {
  AI_PROVIDER: 'gemini',
  AI_MODEL: 'gemini-2.5-flash',
  AI_API_KEY: 'k1,k2',
}

describe('getAIProfiles', () => {
  it('reads the primary profile and splits comma-separated keys', () => {
    expect(getAIProfiles(BASE)).toEqual([{ provider: 'gemini', model: 'gemini-2.5-flash', apiKeys: ['k1', 'k2'] }])
  })

  it('adds numbered profiles in order and skips incomplete ones', () => {
    const profiles = getAIProfiles({
      ...BASE,
      AI_PROVIDER_2: 'nvidia',
      AI_MODEL_2: 'deepseek-ai/deepseek-r1',
      AI_API_KEY_2: 'n1',
      AI_PROVIDER_3: 'nvidia',
      AI_MODEL_3: 'meta/llama-3.2-11b-vision-instruct',
      AI_PROVIDER_4: 'groq',
      AI_MODEL_4: 'llama',
    })
    expect(profiles.map((p) => `${p.provider}/${p.model}`)).toEqual(['gemini/gemini-2.5-flash', 'nvidia/deepseek-ai/deepseek-r1'])
  })

  it('keeps the clear errors for a missing primary setting', () => {
    expect(() => getAIProfiles({ ...BASE, AI_PROVIDER: undefined })).toThrow('AI_PROVIDER is not set')
    expect(() => getAIProfiles({ ...BASE, AI_MODEL: undefined })).toThrow('AI_MODEL is not set')
    expect(() => getAIProfiles({ ...BASE, AI_API_KEY: '' })).toThrow('AI_API_KEY is not set')
  })

  it('accepts omniroute as a provider', () => {
    const profiles = getAIProfiles({ ...BASE, AI_PROVIDER_2: 'omniroute', AI_MODEL_2: 'free-combo', AI_API_KEY_2: 'sk-or' })
    expect(profiles[1]).toEqual({ provider: 'omniroute', model: 'free-combo', apiKeys: ['sk-or'] })
  })

  it('rejects an unknown primary provider', () => {
    expect(() => getAIProfiles({ ...BASE, AI_PROVIDER: 'cohere' })).toThrow('AI_PROVIDER must be one of')
  })
})

describe('resolveJudgeAssignments', () => {
  it('uses profile 1 for everyone when there is only one profile', () => {
    expect(Object.values(resolveJudgeAssignments(1, {}))).toEqual([0, 0, 0, 0, 0])
  })

  it('accepts COUNCIL_ARBITER_PROFILE as the short name for the arbiter pin', () => {
    expect(resolveJudgeAssignments(3, { COUNCIL_ARBITER_PROFILE: '3' }).synthesizer_arbiter).toBe(2)
  })

  it('prefers the full arbiter variable when both are set', () => {
    const env = { COUNCIL_SYNTHESIZER_ARBITER_PROFILE: '2', COUNCIL_ARBITER_PROFILE: '3' }
    expect(resolveJudgeAssignments(3, env).synthesizer_arbiter).toBe(1)
  })

  it('does not let COUNCIL_ARBITER_PROFILE pin the specialists', () => {
    const result = resolveJudgeAssignments(3, { COUNCIL_ARBITER_PROFILE: '3' })
    expect(result.stylometric_linguist).toBe(0)
  })

  it('spreads specialists round-robin and keeps the arbiter on profile 1', () => {
    expect(resolveJudgeAssignments(3, {})).toEqual({
      stylometric_linguist: 0,
      forensic_historian: 1,
      attribution_scholar: 2,
      paraphrase_detective: 0,
      synthesizer_arbiter: 0,
    })
  })

  it('honours COUNCIL_<ROLE>_PROFILE and ignores out-of-range values', () => {
    const result = resolveJudgeAssignments(2, {
      COUNCIL_SYNTHESIZER_ARBITER_PROFILE: '2',
      COUNCIL_FORENSIC_HISTORIAN_PROFILE: '9',
    })
    expect(result.synthesizer_arbiter).toBe(1)
    expect(result.forensic_historian).toBe(1)
  })
})
