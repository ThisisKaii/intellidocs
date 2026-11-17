import { getLearnedFormatPatterns } from '../models/behaviorModel'
import { getDocumentForUser } from '../models/documentModel'
import { resolveDocumentGenre } from '../utils/documentGenre'
import { answerCard, type AssistantCard } from './assistantCards'
import { buildLearnedFormattingPlan, genreLabel, learnedFormattingReply } from './buildLearnedFormattingPlan'

/**
 * "Apply my usual formatting": the habits learned in this document's genre only, as a preview
 * the editor matches against its blocks and applies in one click. An isolated document never
 * gets learned habits.
 */
export async function usualFormattingCard(userId: string, email: string | undefined, documentId: string | undefined): Promise<AssistantCard> {
  if (!documentId) return answerCard('Open a document first, then ask me to apply your usual formatting to it.')
  const doc = await getDocumentForUser(documentId, userId, email)
  if (doc.is_isolated) {
    return answerCard('This document is isolated from learning, so I don’t apply learned habits to it. Turn isolation off in the document settings to use them.')
  }
  const genre = resolveDocumentGenre(doc)
  const rules = buildLearnedFormattingPlan(await getLearnedFormatPatterns(userId, genre))
  const reply = learnedFormattingReply(genre, rules)
  if (rules.length === 0) return answerCard(reply)
  return {
    reply,
    mode: 'preview',
    preview: {
      format: 'learned',
      label: 'Your usual formatting',
      confidence: Math.max(...rules.map((rule) => rule.confidence)),
      reason: `Learned from your ${genreLabel(genre)} documents.`,
      formats: [],
      scope: 'all',
      genre,
      learned: rules,
    },
  }
}
