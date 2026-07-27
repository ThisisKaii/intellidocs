import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { DocumentComment, DocumentReview } from '../types/index'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function addComment(
  documentId: string,
  userId: string,
  comment: string,
  highlightedText?: string
): Promise<DocumentComment> {
  const { data, error } = await supabase
    .from('document_comments')
    .insert({
      document_id: documentId,
      user_id: userId,
      comment,
      highlighted_text: highlightedText || null,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to add comment: ${error.message}`)
  return data
}

export async function getDocumentComments(
  documentId: string
): Promise<DocumentComment[]> {
  const { data, error } = await supabase
    .from('document_comments')
    .select('*')
    .eq('document_id', documentId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Failed to fetch comments: ${error.message}`)
  return data || []
}

export async function submitGrade(
  documentId: string,
  reviewerId: string,
  studentId: string,
  grade: number,
  notes?: string
): Promise<DocumentReview> {
  const { data, error } = await supabase
    .from('document_reviews')
    .insert({
      document_id: documentId,
      reviewer_id: reviewerId,
      student_id: studentId,
      grade,
      status: 'graded',
      notes: notes || null,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to submit grade: ${error.message}`)
  return data
}

export async function getDocumentReview(
  documentId: string
): Promise<DocumentReview | null> {
  const { data, error } = await supabase
    .from('document_reviews')
    .select('*')
    .eq('document_id', documentId)
    .order('reviewed_at', { ascending: false })
    .maybeSingle()

  if (error) throw new Error(`Failed to fetch review: ${error.message}`)
  return data
}
