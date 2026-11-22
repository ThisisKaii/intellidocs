/**
 * Print one profile's raw router reply for a request, to see why a reply could not be read.
 *
 *   npx tsx scripts/routerEval/rawReply.ts <profile> "<request>"
 */
import 'dotenv/config'
import { aiClient } from '../../src/ai/aiClient'
import { buildRouterPrompt } from '../../src/ai/prompts/systemPrompts'
import { routableTools } from '../../src/mcp/assistantFallback'

async function main(): Promise<void> {
  const profile = Number(process.argv[2] ?? '1')
  const message = process.argv[3] ?? 'make the headres biger'
  const prompt = buildRouterPrompt(routableTools(), ['Introduction', 'Methodology'], [])
  const reply = await aiClient.chatOnly(profile, [{ role: 'user', content: message }], prompt)
  console.log(`${reply.provider}/${reply.model}\n---\n${reply.text}\n---`)
}

void main()
