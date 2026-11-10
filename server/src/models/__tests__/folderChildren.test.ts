import { canReadFolder, getChildFolders } from '../folderModel'

type Row = Record<string, unknown>

/** Tiny in-memory tables; queries apply their eq() filters for real. */
const tables: Record<string, Row[]> = { folders: [], class_enrollments: [] }

function makeQuery(table: string): Record<string, unknown> {
  const filters: Array<[string, unknown]> = []
  const query: Record<string, unknown> = {}
  const rows = (): Row[] => (tables[table] ?? []).filter((row) => filters.every(([column, value]) => row[column] === value))
  for (const name of ['select', 'order', 'limit']) query[name] = jest.fn(() => query)
  query.eq = jest.fn((column: string, value: unknown) => {
    filters.push([column, value])
    return query
  })
  query.maybeSingle = jest.fn(async () => ({ data: rows()[0] ?? null, error: null }))
  query.then = (resolve: (value: unknown) => void): void => resolve({ data: rows(), error: null })
  return query
}

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => ({ from: jest.fn((table: string) => makeQuery(table)) })) }))

beforeEach(() => {
  tables.folders = [
    { folder_id: 'class', user_id: 'prof', parent_id: null, folder_type: 'class', name: 'CS 201' },
    { folder_id: 'ws-ana', user_id: 'ana', parent_id: 'class', folder_type: 'personal', name: 'ana' },
    { folder_id: 'sub-ana', user_id: 'ana', parent_id: 'class', folder_type: 'personal', name: 'ana - No ID - Draft' },
    { folder_id: 'ws-ben', user_id: 'ben', parent_id: 'class', folder_type: 'personal', name: 'ben' },
    { folder_id: 'notes', user_id: 'ana', parent_id: null, folder_type: 'personal', name: 'Notes' },
    { folder_id: 'notes-2026', user_id: 'ana', parent_id: 'notes', folder_type: 'personal', name: '2026' },
  ]
  tables.class_enrollments = [
    { folder_id: 'class', student_id: 'ana' },
    { folder_id: 'class', student_id: 'ben' },
  ]
})

const names = (folders: Array<{ name: string }>): string[] => folders.map((folder) => folder.name)

describe('getChildFolders', () => {
  it('shows a student only their own workspace and submission folders in a class', async () => {
    expect(names(await getChildFolders('ana', 'class'))).toEqual(['ana', 'ana - No ID - Draft'])
  })

  it('never shows a student a classmate’s folder', async () => {
    expect(names(await getChildFolders('ben', 'class'))).toEqual(['ben'])
  })

  it('shows the professor every student’s folder in their class', async () => {
    expect(names(await getChildFolders('prof', 'class'))).toEqual(['ana', 'ana - No ID - Draft', 'ben'])
  })

  it('lists the subfolders of a personal folder for its owner', async () => {
    expect(names(await getChildFolders('ana', 'notes'))).toEqual(['2026'])
  })

  it('refuses someone who cannot read the folder', async () => {
    await expect(getChildFolders('stranger', 'class')).rejects.toThrow('Folder not found')
    await expect(getChildFolders('ben', 'notes')).rejects.toThrow('Folder not found')
  })
})

describe('canReadFolder for folders inside a class', () => {
  it('lets the professor open a student’s workspace in their class', async () => {
    expect(await canReadFolder('prof', 'ws-ana')).toBe(true)
  })

  it('does not let a classmate open it', async () => {
    expect(await canReadFolder('ben', 'ws-ana')).toBe(false)
  })

  it('lets the student open their own', async () => {
    expect(await canReadFolder('ana', 'ws-ana')).toBe(true)
  })
})
