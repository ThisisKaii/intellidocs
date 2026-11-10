import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { DocumentComment, DocumentReview, ReviewRubric } from '../types/index'
import { getClassSubmissionLinks } from './folderModel'
import { readAccountNames } from '../utils/accountNames'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

/** Names (or emails) for a set of users from Supabase Auth; unknown ids are left out. */
async function authorNames(userIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  await Promise.all(
    Array.from(new Set(userIds)).map(async (id) => {
      const { data } = await supabase.auth.admin.getUserById(id)
      const user = data?.user
      if (!user) return
      const name = readAccountNames(user.user_metadata).displayName ?? user.email ?? null
      if (name) names.set(id, name)
    })
  )
  return names
}

/** The owner of a document, or null when it does not exist. */
export async function getDocumentOwnerId(documentId: string): Promise<string | null> {
  const { data, error } = await supabase.from('documents').select('user_id').eq('id', documentId).maybeSingle()
  if (error) throw new Error(`Failed to read document: ${error.message}`)
  return (data?.user_id as string | undefined) ?? null
}

/**
 * True when the document was handed in to one of this professor's classes (it
 * sits in a class folder they own, or in a student folder inside one).
 */
export async function professorCanReview(professorId: string, documentId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('folders')
    .select('folder_id')
    .eq('user_id', professorId)
    .eq('folder_type', 'class')
  if (error) throw new Error(`Failed to read classes: ${error.message}`)
  const classIds = (data ?? []).map((row) => row.folder_id as string)
  if (classIds.length === 0) return false
  const links = await getClassSubmissionLinks(classIds)
  return links.some((link) => link.document_id === documentId)
}

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
  const names = await authorNames([userId])
  return { ...data, author_name: names.get(userId) ?? null }
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
  const rows = (data || []) as DocumentComment[]
  const names = await authorNames(rows.map((row) => row.user_id))
  return rows.map((row) => ({ ...row, author_name: names.get(row.user_id) ?? null }))
}

/** A missing `rubric` column (migration 044 not run yet). */
function isMissingRubricColumn(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false
  return error.code === '42703' || error.code === 'PGRST204' || /rubric/i.test(error.message ?? '')
}

export async function submitGrade(
  documentId: string,
  reviewerId: string,
  studentId: string,
  grade: number,
  notes?: string,
  rubric?: ReviewRubric
): Promise<DocumentReview> {
  const row = {
    document_id: documentId,
    reviewer_id: reviewerId,
    student_id: studentId,
    grade,
    status: 'graded',
    notes: notes || null,
  }
  let result = await supabase
    .from('document_reviews')
    .insert(rubric ? { ...row, rubric } : row)
    .select()
    .single()
  // Without migration 044 the grade still saves, just without its breakdown.
  if (rubric && isMissingRubricColumn(result.error)) {
    result = await supabase.from('document_reviews').insert(row).select().single()
  }

  if (result.error) throw new Error(`Failed to submit grade: ${result.error.message}`)
  return result.data as DocumentReview
}

export async function getDocumentReview(
  documentId: string
): Promise<DocumentReview | null> {
  const { data, error } = await supabase
    .from('document_reviews')
    .select('*')
    .eq('document_id', documentId)
    .order('reviewed_at', { ascending: false })
    .limit(1)

  if (error) throw new Error(`Failed to fetch review: ${error.message}`)
  // Each grade is its own row; the newest one is the current grade.
  const latest = (data?.[0] as DocumentReview | undefined) ?? null
  if (!latest) return null
  const names = await authorNames([latest.reviewer_id])
  return { ...latest, reviewer_name: names.get(latest.reviewer_id) ?? null }
}
