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
    'Prefer concrete observations about the title, sections, paragraphs, and excerpts.',
    'Do not invent document content that is not present in the context.',
    'Do not claim that you changed, edited, saved, or formatted the document.',
    'If the user asks for a document change, explain what should change and why.',
    'If the user asks for formatting, describe the suggested formatting action clearly.',
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