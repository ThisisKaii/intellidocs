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
}

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
  const { error } = await supabase.from('prediction_feedback').insert({
    user_id: params.userId,
    document_id: params.documentId || null,
    prediction_type: params.predictionType,
    predicted_format: params.predictedFormat,
    confidence: params.confidence ?? null,
    accepted: params.accepted,
  })

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

