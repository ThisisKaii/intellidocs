import {
  createFolderSchema,
  enrollStudentSchema,
  updateFolderSchema,
} from '../../../schemas/folderSchemas'

describe('createFolderSchema', () => {
  it('defaults a folder with no type to a personal workspace', () => {
    const result = createFolderSchema.parse({ name: 'Chapter Drafts' })

    expect(result.name).toBe('Chapter Drafts')
    expect(result.folderType).toBe('personal')
  })

  it('trims the folder name', () => {
    expect(createFolderSchema.parse({ name: '  Drafts  ' }).name).toBe('Drafts')
  })

  it('rejects an empty folder name', () => {
    expect(createFolderSchema.safeParse({ name: '   ' }).success).toBe(false)
  })

  it('accepts a class folder with a course code and term', () => {
    const result = createFolderSchema.parse({
      name: 'Thesis Supervision',
      folderType: 'class',
      classCode: 'CS-201',
      academicTerm: '2026-T1',
    })

    expect(result.folderType).toBe('class')
    expect(result.classCode).toBe('CS-201')
    expect(result.academicTerm).toBe('2026-T1')
  })

  it('accepts a spaced course code such as "BIO 340"', () => {
    const result = createFolderSchema.parse({
      name: 'Cell Biology Lab',
      folderType: 'class',
      classCode: 'BIO 340',
    })

    expect(result.classCode).toBe('BIO 340')
  })

  it('rejects a class code that is not course-shaped', () => {
    const result = createFolderSchema.safeParse({
      name: 'Thesis Supervision',
      folderType: 'class',
      classCode: 'not-a-course',
    })

    expect(result.success).toBe(false)
  })

  it('rejects course metadata on a personal folder', () => {
    const result = createFolderSchema.safeParse({
      name: 'Chapter Drafts',
      folderType: 'personal',
      classCode: 'CS-201',
    })

    expect(result.success).toBe(false)
  })

  it('rejects an unknown folder type', () => {
    expect(createFolderSchema.safeParse({ name: 'X', folderType: 'shared' }).success).toBe(false)
  })
})

describe('updateFolderSchema', () => {
  it('requires a non-empty name', () => {
    expect(updateFolderSchema.safeParse({ name: '' }).success).toBe(false)
    expect(updateFolderSchema.safeParse({ name: 'Renamed' }).success).toBe(true)
  })
})

describe('enrollStudentSchema', () => {
  it('accepts a valid email', () => {
    expect(enrollStudentSchema.safeParse({ email: 'student@uclm.edu' }).success).toBe(true)
  })

  it('rejects a malformed email', () => {
    expect(enrollStudentSchema.safeParse({ email: 'not-an-email' }).success).toBe(false)
  })
})
