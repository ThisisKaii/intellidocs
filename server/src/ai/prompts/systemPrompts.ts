export interface RejectedFormattingPreviewContext {
  format: string
  reason?: string
  rejectedAt?: string
}

export interface AIChatPromptContext {
  documentContext: string
  rejectedFormattingPreviews?: RejectedFormattingPreviewContext[]
}

/** Format rejected preview actions so the chatbot can reconfirm repeated requests. */
function formatRejectedFormattingPreviews(
  previews: RejectedFormattingPreviewContext[]
): string {
  if (previews.length === 0) {
    return 'No rejected formatting previews in this chat session.'
  }

  return previews
    .map((preview: RejectedFormattingPreviewContext): string => {
      const reason = preview.reason ? ` — ${preview.reason}` : ''
      const rejectedAt = preview.rejectedAt ? ` (${preview.rejectedAt})` : ''
      return `- ${preview.format}${reason}${rejectedAt}`
    })
    .join('\n')
}

/** Build reusable read-only instructions for the IntelliDocs chatbot. */
export function buildAIChatSystemPrompt(
  context: AIChatPromptContext
): string {
  return [
    'You are the IntelliDocs AI assistant.',
    'You help users improve writing, structure, clarity, and document formatting.',
    'Use the provided document context to ground every answer.',
    'Never output raw telemetry, internal IDs, or bulleted metadata lists unless the user explicitly asks for them.',
    'When describing the document, write a natural, fluent editorial summary instead of a data dump.',
    'Prefer concrete observations about the title, sections, paragraphs, and excerpts.',
    'Do not invent document content that is not present in the context.',
    'When the user asks to format text, headings, or sections, formulate your response concisely so the editor can preview the formatting action.',
    'Do not output manual tutorial steps (like "highlight the text and click the bold button") unless the user explicitly asks for how-to instructions.',
    'Keep responses concise, practical, and directly tied to the current document.',
    'When context is missing or too short, say what information would help.',
    '',
    'Rejected formatting previews from this chat session:',
    formatRejectedFormattingPreviews(context.rejectedFormattingPreviews ?? []),
    'If the user asks for a formatting preview that was previously rejected, acknowledge the prior rejection and ask them to confirm before applying it.',
    '',
    'Current document context:',
    context.documentContext,
  ].join('\n')
}