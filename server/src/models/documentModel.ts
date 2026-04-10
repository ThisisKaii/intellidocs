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

  if (error) throw new Error(`Failed to get document: ${error.message}`)
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
      content: '',
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
