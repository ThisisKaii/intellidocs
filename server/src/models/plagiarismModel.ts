import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

/** A student taking part in the class similarity comparison. */
export interface ClassSimilarityStudent {
  studentId: string
  studentName: string
  /** Document ids this student submitted to the folder. */
  documentIds: string[]
}

/** Highest passage similarity found between two students' submissions. */
export interface ClassSimilarityPair {
  studentAId: string
  studentBId: string
  /** Percentage (0–100) of the strongest flagged passage between the pair. */
  similarity: number
}

/** Everything the professor similarity matrix needs for one class folder. */
export interface ClassSimilarityMatrix {
  students: ClassSimilarityStudent[]
  pairs: ClassSimilarityPair[]
}

/** Clamp a similarity score into 0–100 and round it for display. */
function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

/** Resolve a student's display name from Supabase Auth, falling back to a short id. */
async function resolveStudentName(studentId: string): Promise<string> {
  try {
    const { data, error } = await supabase.auth.admin.getUserById(studentId)
    if (error || !data?.user) throw error ?? new Error('User not found')
    const user = data.user
    return (
      (user.user_metadata?.display_name as string | undefined) ??
      user.email?.split('@')[0] ??
      `Student ${studentId.slice(0, 8)}`
    )
  } catch {
    return `Student ${studentId.slice(0, 8)}`
  }
}

/**
 * Build the pairwise similarity matrix for a class folder.
 *
 * Students come from the documents linked to the folder. Pairwise scores come
 * from the council's plagiarism matches: each match links a scanned document to
 * the document it shared text with, so the strongest match between two
 * students' submissions becomes their cell value.
 */
export async function getClassSimilarity(
  folderId: string,
): Promise<ClassSimilarityMatrix> {
  const { data: links, error: linkError } = await supabase
    .from('folder_documents')
    .select('document_id')
    .eq('folder_id', folderId)

  if (linkError) {
    throw new Error(`Failed to load folder documents: ${linkError.message}`)
  }

  const documentIds = Array.from(new Set((links ?? []).map((row) => row.document_id)))
  if (documentIds.length === 0) return { students: [], pairs: [] }

  const { data: docs, error: docError } = await supabase
    .from('documents')
    .select('id,user_id')
    .in('id', documentIds)

  if (docError) {
    throw new Error(`Failed to load documents: ${docError.message}`)
  }

  const ownerByDocument = new Map((docs ?? []).map((doc) => [doc.id, doc.user_id as string]))
  const studentIds = Array.from(new Set((docs ?? []).map((doc) => doc.user_id as string)))
  if (studentIds.length === 0) return { students: [], pairs: [] }

  const documentsByStudent = new Map<string, string[]>()
  for (const doc of docs ?? []) {
    const list = documentsByStudent.get(doc.user_id as string) ?? []
    list.push(doc.id as string)
    documentsByStudent.set(doc.user_id as string, list)
  }

  const { data: scans, error: scanError } = await supabase
    .from('plagiarism_scans')
    .select('scan_id,document_id')
    .in('document_id', documentIds)

  if (scanError) {
    throw new Error(`Failed to load plagiarism scans: ${scanError.message}`)
  }

  const studentByScan = new Map<string, string>()
  for (const scan of scans ?? []) {
    const owner = ownerByDocument.get(scan.document_id)
    if (owner) studentByScan.set(scan.scan_id, owner)
  }

  const pairs = new Map<string, ClassSimilarityPair>()
  const scanIds = Array.from(studentByScan.keys())

  if (scanIds.length > 0) {
    const { data: matches, error: matchError } = await supabase
      .from('plagiarism_matches')
      .select('scan_id,matched_document_id,matched_student_id,similarity_score')
      .in('scan_id', scanIds)

    if (matchError) {
      throw new Error(`Failed to load plagiarism matches: ${matchError.message}`)
    }

    for (const match of matches ?? []) {
      const studentA = studentByScan.get(match.scan_id)
      const studentB =
        match.matched_student_id ??
        (match.matched_document_id
          ? ownerByDocument.get(match.matched_document_id) ?? null
          : null)
      if (!studentA || !studentB || studentA === studentB) continue

      const score = clampPercent(Number(match.similarity_score ?? 0))
      const [first, second] =
        studentA < studentB ? [studentA, studentB] : [studentB, studentA]
      const key = `${first}|${second}`
      const existing = pairs.get(key)
      if (!existing || score > existing.similarity) {
        pairs.set(key, { studentAId: first, studentBId: second, similarity: score })
      }
    }
  }

  const names = await Promise.all(studentIds.map((id) => resolveStudentName(id)))
  const students: ClassSimilarityStudent[] = studentIds.map((studentId, index) => ({
    studentId,
    studentName: names[index],
    documentIds: documentsByStudent.get(studentId) ?? [],
  }))

  return { students, pairs: Array.from(pairs.values()) }
}

/** A document row used by the council scan pipeline. */
export interface ScanDocument {
  id: string
  user_id: string
  title: string
  content: string
}

/** A persisted plagiarism scan row. */
export interface PlagiarismScanRecord {
  scan_id: string
  document_id: string
  user_id: string
  folder_id: string | null
  overall_originality_score: number
  peer_similarity_score: number
  external_similarity_score: number
  active_judges_count: number
  quorum_reached: boolean
  council_transcript: unknown
  scan_status: string
  created_at: string
  updated_at: string
}

/** A persisted flagged-passage match row. */
export interface PlagiarismMatchRecord {
  match_id: string
  scan_id: string
  paragraph_index: number
  char_start: number
  char_end: number
  matched_document_id: string | null
  matched_student_id: string | null
  similarity_score: number
  match_type: string
  match_severity: string
  source_excerpt: string | null
  target_excerpt: string | null
  timeline_verdict: string | null
  flagged_text: string
  council_verdict: unknown
  created_at: string
}

/** One document linked to a class folder, verified by the caller's ownership. */
export async function getFolderDocument(
  folderId: string,
  documentId: string,
): Promise<ScanDocument> {
  const { data: link, error: linkError } = await supabase
    .from('folder_documents')
    .select('document_id')
    .eq('folder_id', folderId)
    .eq('document_id', documentId)
    .maybeSingle()

  if (linkError) throw new Error(`Failed to check folder link: ${linkError.message}`)
  if (!link) {
    const notFound = new Error('Document is not part of this class folder') as Error & { status: number }
    notFound.status = 404
    throw notFound
  }

  const { data, error } = await supabase
    .from('documents')
    .select('id,user_id,title,content')
    .eq('id', documentId)
    .single()

  if (error || !data) throw new Error('Document not found')
  return data as ScanDocument
}

/** Every other document linked to the folder, for peer comparison. */
export async function getFolderPeerDocuments(
  folderId: string,
  excludeDocumentId: string,
): Promise<ScanDocument[]> {
  const { data: links, error } = await supabase
    .from('folder_documents')
    .select('document_id')
    .eq('folder_id', folderId)

  if (error) throw new Error(`Failed to load folder documents: ${error.message}`)

  const documentIds = (links ?? [])
    .map((row) => row.document_id as string)
    .filter((id) => id !== excludeDocumentId)

  if (documentIds.length === 0) return []

  const { data: docs, error: docError } = await supabase
    .from('documents')
    .select('id,user_id,title,content')
    .in('id', documentIds)

  if (docError) throw new Error(`Failed to load peer documents: ${docError.message}`)
  return (docs ?? []) as ScanDocument[]
}

/** The student's other live documents (latest 30, content only) for self-check. */
export async function getOwnOtherDocuments(
  userId: string,
  excludeDocumentId: string,
): Promise<{ id: string; title: string; content: string }[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('id,title,content')
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .neq('id', excludeDocumentId)
    .order('updated_at', { ascending: false })
    .limit(30)

  if (error) throw new Error(`Failed to load your documents: ${error.message}`)
  return (data ?? []) as { id: string; title: string; content: string }[]
}

/** Persist a completed scan and return the stored row. */
export async function createScan(input: {
  documentId: string
  userId: string
  folderId: string
  overallOriginalityScore: number
  peerSimilarityScore: number
  externalSimilarityScore: number
  activeJudgesCount: number
  quorumReached: boolean
  councilTranscript: unknown
  status: string
}): Promise<PlagiarismScanRecord> {
  const { data, error } = await supabase
    .from('plagiarism_scans')
    .insert({
      document_id: input.documentId,
      user_id: input.userId,
      folder_id: input.folderId,
      overall_originality_score: input.overallOriginalityScore,
      peer_similarity_score: input.peerSimilarityScore,
      external_similarity_score: input.externalSimilarityScore,
      active_judges_count: input.activeJudgesCount,
      quorum_reached: input.quorumReached,
      council_transcript: input.councilTranscript,
      scan_status: input.status,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to store scan: ${error.message}`)
  return data as PlagiarismScanRecord
}

/** Persist the flagged matches for a scan. */
export async function createMatches(
  scanId: string,
  matches: Array<{
    paragraphIndex: number
    charStart: number
    charEnd: number
    matchedDocumentId: string | null
    matchedStudentId: string | null
    similarityScore: number
    matchType: string
    matchSeverity: string
    sourceExcerpt: string | null
    targetExcerpt: string | null
    flaggedText: string
    councilVerdict: unknown
    timelineVerdict: string | null
  }>,
): Promise<PlagiarismMatchRecord[]> {
  if (matches.length === 0) return []

  const { data, error } = await supabase
    .from('plagiarism_matches')
    .insert(
      matches.map((match) => ({
        scan_id: scanId,
        paragraph_index: match.paragraphIndex,
        char_start: match.charStart,
        char_end: match.charEnd,
        matched_document_id: match.matchedDocumentId,
        matched_student_id: match.matchedStudentId,
        similarity_score: match.similarityScore,
        match_type: match.matchType,
        match_severity: match.matchSeverity,
        source_excerpt: match.sourceExcerpt,
        target_excerpt: match.targetExcerpt,
        flagged_text: match.flaggedText,
        council_verdict: match.councilVerdict,
        timeline_verdict: match.timelineVerdict,
      })),
    )
    .select()

  if (error) throw new Error(`Failed to store matches: ${error.message}`)
  return (data ?? []) as PlagiarismMatchRecord[]
}

/** Fetch one scan by id, or null when it does not exist. */
export async function getScanById(scanId: string): Promise<PlagiarismScanRecord | null> {
  const { data, error } = await supabase
    .from('plagiarism_scans')
    .select('*')
    .eq('scan_id', scanId)
    .maybeSingle()

  if (error) throw new Error(`Failed to load scan: ${error.message}`)
  return (data as PlagiarismScanRecord | null) ?? null
}

/** List every match flagged for a scan, in paragraph order. */
export async function getMatchesForScan(scanId: string): Promise<PlagiarismMatchRecord[]> {
  const { data, error } = await supabase
    .from('plagiarism_matches')
    .select('*')
    .eq('scan_id', scanId)
    .order('paragraph_index', { ascending: true })

  if (error) throw new Error(`Failed to load matches: ${error.message}`)
  return (data ?? []) as PlagiarismMatchRecord[]
}

/** List scans recorded for a folder, newest first. */
export async function listScansForFolder(folderId: string): Promise<PlagiarismScanRecord[]> {
  const { data, error } = await supabase
    .from('plagiarism_scans')
    .select('*')
    .eq('folder_id', folderId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to list scans: ${error.message}`)
  return (data ?? []) as PlagiarismScanRecord[]
}

/** Read just the title of a document, for scan inspection headers. */
export async function getDocumentTitle(documentId: string): Promise<string> {
  const { data, error } = await supabase
    .from('documents')
    .select('title')
    .eq('id', documentId)
    .maybeSingle()

  if (error) return 'Untitled document'
  return (data?.title as string | undefined) ?? 'Untitled document'
}
