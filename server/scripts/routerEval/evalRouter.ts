/**
 * Router benchmark: how well each configured AI profile picks the assistant's tool for requests the
 * fixed rules do not handle. Runs the real router prompt and checks, one profile at a time with no
 * failover, against the labelled cases in cases.json.
 *
 *   npx tsx scripts/routerEval/evalRouter.ts [profiles=1,2] [report.json]
 *
 * Makes one real AI call per case per profile (paced for free-tier limits).
 */
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { ZodTypeAny } from 'zod'
import { aiClient } from '../../src/ai/aiClient'
import { routableTools } from '../../src/mcp/assistantFallback'
import { routeAssistantRequest, type RouteDecision } from '../../src/skills/routeAssistantRequest'
import {
  applyPresetSchema,
  autoCaptionSchema,
  fixFormattingSuggestionsSchema,
  formatBlocksSchema,
  insertBibliographySchema,
  renumberCaptionsSchema,
  setPageSetupSchema,
} from '../../schemas/mcpSchemas'

type Expected = { tool: string; args: Record<string, unknown> } | { oneOf: Array<{ tool: string; args: Record<string, unknown> }> } | { kind: Array<'clarify' | 'none'> }
interface Case {
  group: string
  message: string
  expect: Expected
}
interface Outcome {
  group: string
  message: string
  ok: boolean
  /** The reply was not a usable tool choice, or its arguments failed the tool's own checks. */
  invalid: boolean
  ms: number
  provider: string
  got: string
  expected: string
}

const PAUSE_MS = 2500
/** The tool's own checks: arguments are compared after them, as the app would see them. */
const SCHEMAS: Record<string, ZodTypeAny | null> = {
  formatBlocks: formatBlocksSchema,
  setPageSetup: setPageSetupSchema,
  applyPreset: applyPresetSchema,
  autoCaption: autoCaptionSchema,
  renumberCaptions: renumberCaptionsSchema,
  fixFormattingSuggestions: fixFormattingSuggestionsSchema,
  insertBibliography: insertBibliographySchema,
  // Needs the open document's id, which the server fills in: nothing to check here.
  applyUsualFormatting: null,
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function same(expected: unknown, actual: unknown): boolean {
  if (typeof expected === 'string') return typeof actual === 'string' && actual.trim().toLowerCase() === expected.trim().toLowerCase()
  if (typeof expected === 'number') return typeof actual === 'number' && Math.abs(actual - expected) < 0.01
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false
    return expected.every((item) => actual.some((other) => same(item, other)))
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object') return false
    return Object.entries(expected).every(([key, value]) => same(value, (actual as Record<string, unknown>)[key]))
  }
  return expected === actual
}

/** The tool's arguments after its own schema (defaults filled in), or null when they fail it. */
function checkedArgs(tool: string, args: Record<string, unknown>): Record<string, unknown> | null {
  const schema = SCHEMAS[tool]
  if (schema === undefined) return null
  if (schema === null) return args
  const parsed = schema.safeParse(args)
  return parsed.success ? (parsed.data as Record<string, unknown>) : null
}

function score(expected: Expected, decision: RouteDecision): { ok: boolean; invalid: boolean } {
  if ('kind' in expected) return { ok: (expected.kind as string[]).includes(decision.kind), invalid: false }
  if (decision.kind !== 'tool') return { ok: false, invalid: false }
  const args = checkedArgs(decision.tool, decision.args)
  if (!args) return { ok: false, invalid: true }
  const options = 'oneOf' in expected ? expected.oneOf : [expected]
  return { ok: options.some((option) => option.tool === decision.tool && same(option.args, args)), invalid: false }
}

function describe(decision: RouteDecision): string {
  if (decision.kind === 'tool') return `${decision.tool} ${JSON.stringify(decision.args)} (${decision.confidence})`
  if (decision.kind === 'clarify') return `clarify: ${decision.question} [${decision.options.map((option) => option.tool).join(', ')}]`
  return `none: ${decision.reason}`
}

async function runProfile(profile: number, cases: Case[], sectionTitles: string[]): Promise<Outcome[]> {
  const outcomes: Outcome[] = []
  for (const testCase of cases) {
    let provider = '?'
    let decision: RouteDecision = { kind: 'none', reason: 'not run' }
    let ms = 0
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const started = Date.now()
      let failed = false
      decision = await routeAssistantRequest(
        { message: testCase.message, tools: routableTools(), sectionTitles, rejected: [] },
        async (messages, systemPrompt) => {
          try {
            const reply = await aiClient.chatOnly(profile, messages, systemPrompt)
            provider = `${reply.provider}/${reply.model}`
            return reply
          } catch (error) {
            failed = true
            throw error
          }
        }
      )
      ms = Date.now() - started
      if (!failed) break
      // A rate limit or outage: wait and try once more, so the score is about answers, not limits.
      await sleep(20_000)
    }
    const { ok, invalid } = score(testCase.expect, decision)
    outcomes.push({ group: testCase.group, message: testCase.message, ok, invalid, ms, provider, got: describe(decision), expected: JSON.stringify(testCase.expect) })
    process.stdout.write(ok ? '.' : invalid ? '!' : 'x')
    await sleep(PAUSE_MS)
  }
  process.stdout.write('\n')
  return outcomes
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0
}

async function main(): Promise<void> {
  const profiles = (process.argv[2] ?? '1,2').split(',').map(Number)
  const reportPath = process.argv[3]
  const { cases, sectionTitles } = JSON.parse(readFileSync(join(__dirname, 'cases.json'), 'utf-8')) as { cases: Case[]; sectionTitles: string[] }
  const report: Record<string, Outcome[]> = {}
  for (const profile of profiles) {
    console.log(`profile ${profile}: ${cases.length} cases`)
    report[profile] = await runProfile(profile, cases, sectionTitles)
  }

  const groups = [...new Set(cases.map((testCase) => testCase.group))]
  console.log('\n| | ' + profiles.map((profile) => `profile ${profile} (${report[profile][0]?.provider ?? '?'})`).join(' | ') + ' |')
  console.log('|---|' + profiles.map(() => '---').join('|') + '|')
  const row = (label: string, value: (outcomes: Outcome[]) => string): void => console.log(`| ${label} | ${profiles.map((profile) => value(report[profile])).join(' | ')} |`)
  row('**correct**', (outcomes) => `**${outcomes.filter((outcome) => outcome.ok).length}/${outcomes.length}**`)
  for (const group of groups) {
    row(group, (outcomes) => {
      const inGroup = outcomes.filter((outcome) => outcome.group === group)
      return `${inGroup.filter((outcome) => outcome.ok).length}/${inGroup.length}`
    })
  }
  row('invalid replies', (outcomes) => String(outcomes.filter((outcome) => outcome.invalid).length))
  row('median time', (outcomes) => `${(percentile(outcomes.map((outcome) => outcome.ms), 50) / 1000).toFixed(1)} s`)
  row('slowest 10%', (outcomes) => `${(percentile(outcomes.map((outcome) => outcome.ms), 90) / 1000).toFixed(1)} s`)

  for (const profile of profiles) {
    const misses = report[profile].filter((outcome) => !outcome.ok)
    console.log(`\nprofile ${profile} misses (${misses.length}):`)
    for (const miss of misses) console.log(`- [${miss.group}] "${miss.message}"\n    got:      ${miss.got}\n    expected: ${miss.expected}`)
  }
  if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 2))
}

void main()
