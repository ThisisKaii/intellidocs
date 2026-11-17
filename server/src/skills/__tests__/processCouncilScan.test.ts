const createMatches = jest.fn()
const updateScan = jest.fn()
const getFolderPeerDocuments = jest.fn()
const createNotification = jest.fn()
const runCouncilScan = jest.fn()

jest.mock('../../models/plagiarismModel', () => ({
  createMatches: (...args: unknown[]) => createMatches(...args),
  updateScan: (...args: unknown[]) => updateScan(...args),
  getFolderPeerDocuments: (...args: unknown[]) => getFolderPeerDocuments(...args),
  getProfessorPeerDocuments: jest.fn(),
  getProfessorClassScope: jest.fn(),
}))
jest.mock('../../models/behaviorModel', () => ({ getBehaviorEvents: jest.fn(async () => []) }))
jest.mock('../../models/notificationModel', () => ({ createNotification: (...args: unknown[]) => createNotification(...args) }))
jest.mock('../runCouncilScan', () => ({ runCouncilScan: (...args: unknown[]) => runCouncilScan(...args) }))

import { processCouncilScan } from '../processCouncilScan'

const job = {
  scanId: 'scan-1',
  requesterId: 'prof-1',
  documentId: 'doc-1',
  folderId: 'folder-1',
  scope: 'local' as const,
  document: { id: 'doc-1', user_id: 'student-1', title: 'Thesis', content: '<p>text</p>' },
}

beforeEach(() => {
  jest.clearAllMocks()
  getFolderPeerDocuments.mockResolvedValue([{ id: 'doc-2', user_id: 'student-2', title: 'Peer', content: '<p>x</p>' }])
  createMatches.mockResolvedValue([])
  updateScan.mockResolvedValue({})
  createNotification.mockResolvedValue({})
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('processCouncilScan', () => {
  it('records the verdict and matches on the running scan, then tells the professor who started it', async () => {
    runCouncilScan.mockResolvedValue({
      overall_originality_score: 87,
      peer_similarity_score: 13,
      active_judges: 5,
      quorum_reached: true,
      transcript: [{ judge: 'a' }],
      matches: [{ paragraph_index: 2, char_start: 0, char_end: 10, matched_document_id: 'doc-2', similarity_score: 0.9, match_type: 'verbatim', match_severity: 'high', flagged_text: 'copied' }],
    })
    await processCouncilScan(job)
    expect(createMatches).toHaveBeenCalledWith('scan-1', [expect.objectContaining({ paragraphIndex: 2, matchedFolderId: 'folder-1' })])
    expect(updateScan).toHaveBeenCalledWith('scan-1', expect.objectContaining({ status: 'completed', overallOriginalityScore: 87, quorumReached: true }))
    expect(createNotification).toHaveBeenCalledWith(
      'prof-1',
      'plagiarism_scan_complete',
      'Originality Scan Complete',
      'Originality scan for "Thesis" finished: 87% original.',
      { scanId: 'scan-1', documentId: 'doc-1' },
    )
  })

  it('marks the scan failed and says so when the judges cannot finish', async () => {
    runCouncilScan.mockRejectedValue(new Error('all judges timed out'))
    await processCouncilScan(job)
    expect(updateScan).toHaveBeenCalledWith('scan-1', { status: 'failed', councilTranscript: { error: 'all judges timed out' } })
    expect(createNotification).toHaveBeenCalledWith('prof-1', 'plagiarism_scan_failed', 'Originality Scan Failed', expect.any(String), { scanId: 'scan-1', documentId: 'doc-1' })
  })
})
