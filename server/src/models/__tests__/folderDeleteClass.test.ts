import { deleteFolder, sourceClassLabel } from '../folderModel'

type Row = Record<string, unknown>

/** In-memory folders; records every update and delete the model sends, in order. */
const state: { folders: Row[]; log: Array<{ op: string; payload?: Row; filters: Array<[string, unknown]> }>; updateError: { code?: string; message: string } | null } = {
  folders: [],
  log: [],
  updateError: null,
}

function makeQuery(): Record<string, unknown> {
  const filters: Array<[string, unknown]> = []
  let op: { op: string; payload?: Row } | null = null
  const query: Record<string, unknown> = {}
  query.select = jest.fn(() => query)
  query.eq = jest.fn((column: string, value: unknown) => {
    filters.push([column, value])
    return query
  })
  query.update = jest.fn((payload: Row) => {
    op = { op: 'update', payload }
    return query
  })
  query.delete = jest.fn(() => {
    op = { op: 'delete' }
    return query
  })
  query.maybeSingle = jest.fn(async () => ({
    data: state.folders.find((row) => filters.every(([column, value]) => row[column] === value)) ?? null,
    error: null,
  }))
  query.then = (resolve: (value: unknown) => void): void => {
    if (op) state.log.push({ ...op, filters })
    resolve({ error: op?.op === 'update' ? state.updateError : null })
  }
  return query
}

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => ({ from: jest.fn(() => makeQuery()) })) }))

beforeEach(() => {
  state.folders = [
    { folder_id: 'class', user_id: 'prof', parent_id: null, folder_type: 'class', name: 'Capstone Writing', class_code: 'CS-201' },
    { folder_id: 'notes', user_id: 'prof', parent_id: null, folder_type: 'personal', name: 'Notes', class_code: null },
  ]
  state.log = []
  state.updateError = null
})

describe('deleting a class', () => {
  it('labels the students’ folders with the class before deleting it', async () => {
    await deleteFolder('prof', 'class')
    expect(state.log.map((entry) => entry.op)).toEqual(['update', 'delete'])
    expect(state.log[0]).toMatchObject({ payload: { source_class_name: 'Capstone Writing (CS-201)' }, filters: [['parent_id', 'class']] })
    expect(state.log[1].filters).toEqual([['folder_id', 'class']])
  })

  it('still deletes the class before migration 043 adds the column', async () => {
    state.updateError = { code: 'PGRST204', message: "Could not find the 'source_class_name' column" }
    await deleteFolder('prof', 'class')
    expect(state.log.map((entry) => entry.op)).toEqual(['update', 'delete'])
  })

  it('does not label anything when a personal folder is deleted', async () => {
    await deleteFolder('prof', 'notes')
    expect(state.log.map((entry) => entry.op)).toEqual(['delete'])
  })
})

describe('sourceClassLabel', () => {
  it('names the class with its code when it has one', () => {
    expect(sourceClassLabel({ name: 'Capstone Writing', class_code: 'CS-201' })).toBe('Capstone Writing (CS-201)')
    expect(sourceClassLabel({ name: 'E2E Seed Class', class_code: null })).toBe('E2E Seed Class')
  })
})
