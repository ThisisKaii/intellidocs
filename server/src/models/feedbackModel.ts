import { createClient } from '@supabase/supabase-js'

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || 'https://placeholder.supabase.co'
  const key = process.env.SUPABASE_SERVICE_KEY || 'placeholder-key'
  return createClient(url, key)
}

export interface CreateFeedbackParams {
  userId: string
  documentId?: string
  predictionType: 'format_prompt' | 'suggestion_panel' | 'chat_preview'
  predictedFormat: string
  confidence?: number
  accepted: boolean
  /** The text of the block the suggestion was for (the prediction's features come from it). */
  blockText?: string
  /** On a rejection, the format the block stayed: the label the user's model learns. */
  keptFormat?: string
}

/** Columns a database without migration 052 does not have yet. */
const UNDEFINED_COLUMN_CODES = ['42703', 'PGRST204']

export interface FeedbackAccuracyStats {
  totalPredictions: number
  totalAccepted: number
  totalRejected: number
  accuracyRatio: number
}

/** Insert a structured AI prediction feedback record into Supabase. */
export async function createFeedbackRecord(
  params: CreateFeedbackParams
): Promise<void> {
  const supabase = getSupabaseClient()
  const record = {
    user_id: params.userId,
    document_id: params.documentId || null,
    prediction_type: params.predictionType,
    predicted_format: params.predictedFormat,
    confidence: params.confidence ?? null,
    accepted: params.accepted,
  }
  const hasBlock = params.blockText !== undefined || params.keptFormat !== undefined
  let { error } = await supabase.from('prediction_feedback').insert(
    hasBlock ? { ...record, block_text: params.blockText ?? null, kept_format: params.keptFormat ?? null } : record
  )
  // Before migration 052 the block columns do not exist: the feedback itself is still kept.
  if (error && hasBlock && UNDEFINED_COLUMN_CODES.includes(error.code ?? '')) {
    ;({ error } = await supabase.from('prediction_feedback').insert(record))
  }

  if (error) {
    console.error('Failed to create prediction feedback record in Supabase:', error)
    throw new Error(`Failed to save feedback: ${error.message}`)
  }
}

/** Compute overall user prediction accuracy statistics for RQ1 research reporting. */
export async function getFeedbackAccuracyStats(
  userId: string
): Promise<FeedbackAccuracyStats> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('prediction_feedback')
    .select('accepted')
    .eq('user_id', userId)


  if (error || !data) {
    return { totalPredictions: 0, totalAccepted: 0, totalRejected: 0, accuracyRatio: 0 }
  }

  const totalPredictions = data.length
  if (totalPredictions === 0) {
    return { totalPredictions: 0, totalAccepted: 0, totalRejected: 0, accuracyRatio: 0 }
  }

  const totalAccepted = data.filter((row: { accepted: boolean }) => row.accepted).length
  const totalRejected = totalPredictions - totalAccepted
  const accuracyRatio = Math.round((totalAccepted / totalPredictions) * 100) / 100

  return {
    totalPredictions,
    totalAccepted,
    totalRejected,
    accuracyRatio,
  }
}


/** The most recent feedback rows for a user, newest first, for progress summaries. */
export async function listFeedbackRows(
  userId: string,
  limit: number = 5000
): Promise<Array<{ prediction_type: string; accepted: boolean; created_at: string }>> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('prediction_feedback')
    .select('prediction_type,accepted,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error || !data) return []
  return data as Array<{ prediction_type: string; accepted: boolean; created_at: string }>
}


/** How many of the user's feedback records carry their block (and so can train their model); 0 before migration 052. */
export async function countFeedbackTrainingExamples(userId: string): Promise<number> {
  const supabase = getSupabaseClient()
  const { count, error } = await supabase
    .from('prediction_feedback')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('block_text', 'is', null)
  return error || typeof count !== 'number' ? 0 : count
}

/** One labeled block for training the user's own formatting model. */
export interface FeedbackTrainingExample {
  text: string
  /** The format the user wants for this block: the suggestion when accepted, else what it stayed. */
  label: string
  genre: string
}

/**
 * The user's feedback that can train a model: rows that recorded their block (migration 052), each
 * with its label and its document's genre. An accepted suggestion labels the block with the
 * suggested format; a rejected one with the format the block kept. Rows without a block, or a
 * rejection without the kept format, teach nothing and are left out. [] before migration 052.
 */
export async function listFeedbackTrainingExamples(
  userId: string,
  limit: number = 5000
): Promise<FeedbackTrainingExample[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('prediction_feedback')
    .select('block_text,predicted_format,kept_format,accepted,documents(genre)')
    .eq('user_id', userId)
    .not('block_text', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error || !data) return []
  const rows = data as unknown as Array<{
    block_text: string | null
    predicted_format: string
    kept_format: string | null
    accepted: boolean
    documents: { genre?: string | null } | Array<{ genre?: string | null }> | null
  }>
  const examples: FeedbackTrainingExample[] = []
  for (const row of rows) {
    const text = (row.block_text ?? '').trim()
    const label = row.accepted ? row.predicted_format : row.kept_format
    if (!text || !label) continue
    const document = Array.isArray(row.documents) ? row.documents[0] : row.documents
    examples.push({ text, label, genre: document?.genre || 'general' })
  }
  return examples
}
