import type { z } from 'zod'
import {
  applyBulkFormattingSchema,
  applyFormattingSchema,
  applyPresetSchema,
  applyUsualFormattingSchema,
  autoCaptionSchema,
  explainSuggestionSchema,
  fixFormattingSuggestionsSchema,
  formatBlocksSchema,
  getBehaviorSummarySchema,
  getDocumentContentSchema,
  getUserProfileSchema,
  insertBibliographySchema,
  predictNextFormatSchema,
  refineAcademicStyleSchema,
  renumberCaptionsSchema,
  searchLiteratureAndCiteSchema,
  setPageSetupSchema,
  structureUserSectionSchema,
} from '../../schemas/mcpSchemas'
import { automationCard, captionsCard, formattingCard, presetCard, type AssistantCard } from '../skills/assistantCards'
import type { TargetCategory } from '../skills/parseFormattingIntent'
import { usualFormattingCard } from '../skills/usualFormattingCard'
import { applyBulkFormatting } from './tools/applyBulkFormatting'
import { applyFormatting } from './tools/applyFormatting'
import { explainSuggestion } from './tools/explainSuggestion'
import { getBehaviorSummary } from './tools/getBehaviorSummary'
import { getDocumentContent } from './tools/getDocumentContent'
import { getUserProfile } from './tools/getUserProfile'
import { predictNextFormat } from './tools/predictNextFormat'
import { refineAcademicStyle } from './tools/refineAcademicStyle'
import { searchLiteratureAndCite } from './tools/searchLiteratureAndCite'
import { structureUserSection } from './tools/structureUserSection'

export interface ToolContext {
  userId: string
  email?: string
}

/**
 * What a tool does to the document:
 * - `reads`: returns data, changes nothing.
 * - `suggests`: works on the user's own text and returns suggestions shown as a card.
 * - `plans`: returns an assistant card (a preview); the change happens only when the user applies it.
 */
export type ToolEffect = 'reads' | 'suggests' | 'plans'

/** A tool as callers see it: what it is for, what it changes and the arguments it takes. */
export interface ToolDescription {
  name: string
  description: string
  effect: ToolEffect
  /** The arguments in words: "preset: apa_7th | ieee | uclm_capstone". */
  params: string
}

interface RegisteredTool extends ToolDescription {
  /** Validate the raw arguments with the tool's schema (a ZodError on bad input), then run it. */
  call: (ctx: ToolContext, rawArgs: unknown) => Promise<unknown>
}

function defineTool<S extends z.ZodTypeAny>(
  description: ToolDescription,
  schema: S,
  run: (ctx: ToolContext, args: z.infer<S>) => Promise<unknown>
): RegisteredTool {
  return { ...description, call: (ctx, rawArgs) => run(ctx, schema.parse(rawArgs ?? {})) }
}

/** A plan tool's result: the card the chat shows. */
function card(value: AssistantCard): { card: AssistantCard } {
  return { card: value }
}

/**
 * Every tool the assistant can use, in one place: the MCP router lists and calls these, and the
 * chat renders a plan tool's card exactly like a chat reply. Nothing here edits a document; a plan
 * tool's change happens in the editor only after the user presses Apply.
 */
const TOOLS: RegisteredTool[] = [
  // ── Reading ──────────────────────────────────────────────────────────
  defineTool(
    { name: 'getDocumentContent', effect: 'reads', description: 'Read a document’s text, a page at a time.', params: 'documentId, page?, pageSize?' },
    getDocumentContentSchema,
    (ctx, args) => getDocumentContent({ userId: ctx.userId }, args)
  ),
  defineTool(
    { name: 'getUserProfile', effect: 'reads', description: 'The signed-in user’s profile and settings.', params: '(none)' },
    getUserProfileSchema,
    (ctx) => getUserProfile({ userId: ctx.userId, email: ctx.email })
  ),
  defineTool(
    { name: 'getBehaviorSummary', effect: 'reads', description: 'What the user has formatted in a document, summarised.', params: 'documentId' },
    getBehaviorSummarySchema,
    (ctx, args) => getBehaviorSummary({ userId: ctx.userId }, args)
  ),
  defineTool(
    { name: 'predictNextFormat', effect: 'reads', description: 'The format the model predicts for a piece of text.', params: 'text' },
    predictNextFormatSchema,
    (_ctx, args) => predictNextFormat(args)
  ),
  defineTool(
    { name: 'explainSuggestion', effect: 'reads', description: 'Explain a formatting suggestion in words.', params: 'format, confidence (0–1), reason?' },
    explainSuggestionSchema,
    (_ctx, args) => explainSuggestion(args)
  ),

  // ── Formatting ───────────────────────────────────────────────────────
  defineTool(
    {
      name: 'formatBlocks',
      effect: 'plans',
      description:
        'Format text: marks, heading levels, lists, alignment, font size (absolute or bigger/smaller), line spacing, first-line indent, font, letter case, or removing formatting. Applies to a kind of block, everything except a kind, a named section, the document title, or the selection.',
      params:
        'formats? [bold, italic, underline, heading1–3, blockquote, unordered_list, ordered_list, align_left/center/right/justify], fontSize?, fontSizeStep?, lineSpacing?, firstLineIndentIn?, fontFamily?, textCase? upper|title, removeFormatting?, targetCategory? (headings, h1Headings, h2Headings, h3Headings, sections, paragraphs, chapters, questions, lists, bulletLists, numberedLists, tables, captions, quotes, except:<any of these>, all), target? (a section title), targetMode? literal|heading|section|title, scope? selection|all',
    },
    formatBlocksSchema,
    async (_ctx, args) => {
      const targetCategory = args.targetCategory as TargetCategory
      const targetMode = args.targetMode ?? (args.target ? 'heading' : null)
      return card(
        formattingCard({
          formats: args.formats,
          fontSize: args.fontSize,
          normalize: args.removeFormatting,
          scope: args.scope ?? (args.target !== null || targetCategory !== 'all' ? 'all' : 'selection'),
          target: args.target,
          targetMode,
          targetCategory,
          style: {
            lineSpacing: args.lineSpacing,
            firstLineIndentIn: args.firstLineIndentIn,
            fontFamily: args.fontFamily,
            textCase: args.textCase,
            fontSizeStep: args.fontSizeStep,
          },
        })
      )
    }
  ),
  defineTool(
    { name: 'applyPreset', effect: 'plans', description: 'Switch the document to an academic preset: its page setup, body text and heading styles.', params: 'preset: apa_7th | ieee | uclm_capstone' },
    applyPresetSchema,
    async (_ctx, args) => card(presetCard(args.preset))
  ),
  defineTool(
    { name: 'applyUsualFormatting', effect: 'plans', description: 'Apply the formatting habits learned from the user’s other documents of the same genre.', params: 'documentId' },
    applyUsualFormattingSchema,
    async (ctx, args) => card(await usualFormattingCard(ctx.userId, ctx.email, args.documentId))
  ),
  defineTool(
    {
      name: 'fixFormattingSuggestions',
      effect: 'plans',
      description: 'Apply the formatting fixes IntelliDocs found in the document (figure placement, caption numbers, extra blank lines, headings), all or one group.',
      params: 'only? all | figures | captions | blankLines | headings',
    },
    fixFormattingSuggestionsSchema,
    async (_ctx, args) => card(automationCard({ action: 'fixSuggestions', only: args.only }))
  ),
  defineTool(
    { name: 'setPageSetup', effect: 'plans', description: 'Change the page size, orientation or margins (inches).', params: 'pageSize? short|long|a4|letter|legal, orientation? portrait|landscape, margins? {top?, bottom?, left?, right?}' },
    setPageSetupSchema,
    async (_ctx, args) => card(automationCard({ action: 'pageSetup', ...args }))
  ),

  // ── Figures, tables and references ──────────────────────────────────
  defineTool(
    { name: 'autoCaption', effect: 'plans', description: 'Caption every figure and/or table that has none; titles only from the document’s own words.', params: 'kinds? [figure, table]' },
    autoCaptionSchema,
    async (_ctx, args) => card(captionsCard(args.kinds))
  ),
  defineTool(
    { name: 'renumberCaptions', effect: 'plans', description: 'Renumber every figure and table caption in document order.', params: '(none)' },
    renumberCaptionsSchema,
    async () => card(automationCard({ action: 'renumberCaptions' }))
  ),
  defineTool(
    { name: 'insertBibliography', effect: 'plans', description: 'Write the reference list from the sources cited in the document, in its citation style.', params: '(none)' },
    insertBibliographySchema,
    async () => card(automationCard({ action: 'bibliography' }))
  ),

  // ── Writing help (the user’s own words only) ────────────────────────
  defineTool(
    { name: 'structureUserSection', effect: 'suggests', description: 'Organise the user’s own notes into a section; never writes new content.', params: 'sectionTitle, userNotes, genre?' },
    structureUserSectionSchema,
    (_ctx, args) => structureUserSection(args)
  ),
  defineTool(
    { name: 'searchLiteratureAndCite', effect: 'suggests', description: 'Find real published papers (Crossref, Semantic Scholar) for a claim.', params: 'query, claimText?, style? ieee|apa' },
    searchLiteratureAndCiteSchema,
    (_ctx, args) => searchLiteratureAndCite(args)
  ),
  defineTool(
    { name: 'refineAcademicStyle', effect: 'suggests', description: 'Suggest academic-tone revisions of the user’s own text.', params: 'text, focus? clarity|hedging|vocabulary|all' },
    refineAcademicStyleSchema,
    (_ctx, args) => refineAcademicStyle(args)
  ),

  // ── Older formatting tools (log a format; the client applies it) ────
  defineTool(
    { name: 'applyFormatting', effect: 'plans', description: 'Older single-format tool; prefer formatBlocks.', params: 'documentId, format, mode preview|commit, selection?, reason?' },
    applyFormattingSchema,
    (ctx, args) => applyFormatting({ userId: ctx.userId }, args)
  ),
  defineTool(
    { name: 'applyBulkFormatting', effect: 'plans', description: 'Older range-based tool; prefer formatBlocks.', params: 'documentId, format, mode preview|commit, targets [{from, to}], reason?' },
    applyBulkFormattingSchema,
    (ctx, args) => applyBulkFormatting({ userId: ctx.userId }, args)
  ),
]

const BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]))

/** Every tool, described for callers (no handlers). */
export function listTools(): ToolDescription[] {
  return TOOLS.map(({ name, description, effect, params }) => ({ name, description, effect, params }))
}

/** The tool with this name, or undefined. */
export function findTool(name: string): RegisteredTool | undefined {
  return BY_NAME.get(name)
}
