import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { Document, CreateDocumentRequest, UpdateDocumentRequest } from '../types/index'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

export async function getDocuments(userId: string): Promise<Document[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Failed to get documents: ${error.message}`)
  return data || []
}

export async function getDocumentById(id: string, userId: string): Promise<Document> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      const notFound = new Error('Document not found') as Error & { status: number }
      notFound.status = 404
      throw notFound
    }
    throw new Error(`Failed to get document: ${error.message}`)
  }
  return data!
}

export async function createDocument(
  userId: string,
  req: CreateDocumentRequest
): Promise<Document> {
  const { data, error } = await supabase
    .from('documents')
    .insert({
      user_id: userId,
      title: req.title,
      content: req.content ?? '',
      header_content: req.header_content ?? '',
      footer_content: req.footer_content ?? '',
      show_header: req.show_header ?? false,
      show_footer: req.show_footer ?? false,
      header_number_format: req.header_number_format ?? 'none',
      footer_number_format: req.footer_number_format ?? 'none',
      page_size: req.page_size ?? 'short',
      margins: req.margins ?? { top: 1, bottom: 1, left: 1.5, right: 1 },
      orientation: req.orientation ?? 'portrait',
      formatting_history: [],
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create document: ${error.message}`)
  return data
}

export async function updateDocument(
  id: string,
  userId: string,
  req: UpdateDocumentRequest
): Promise<Document> {
  const { data, error } = await supabase
    .from('documents')
    .update(req)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) throw new Error(`Failed to update document: ${error.message}`)
  return data!
}

export async function deleteDocument(
  id: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) throw new Error(`Failed to delete document: ${error.message}`)
}
