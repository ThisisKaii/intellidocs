import { checkStudyLoadNameMatch, resolveApplicantNames } from '../studyLoadMatcher'

describe('checkStudyLoadNameMatch', () => {
  const SAMPLE_UC_STUDY_LOAD_TEXT = `
    UNIVERSITY OF CEBU
    OFFICIALLY ENROLLED
    1st Semester S.Y. 2026 - 2027
    Name: ASINGUA, JOSHUA L. (23249600)
    College: COLLEGE OF COMPUTER STUDIES
    Course: BSIT
    Year Level: 4
    IT-CPSTONE40 3 SAT 6:31 PM - 9:31 PM 208 BSIT
  `

  it('matches standard first and last name from UC study load', () => {
    expect(checkStudyLoadNameMatch(SAMPLE_UC_STUDY_LOAD_TEXT, 'Joshua', 'Asingua')).toBe(true)
  })

  it('matches when first name includes middle initial or name', () => {
    expect(checkStudyLoadNameMatch(SAMPLE_UC_STUDY_LOAD_TEXT, 'Joshua L.', 'Asingua')).toBe(true)
    expect(checkStudyLoadNameMatch(SAMPLE_UC_STUDY_LOAD_TEXT, 'Joshua Lopez', 'Asingua')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(checkStudyLoadNameMatch(SAMPLE_UC_STUDY_LOAD_TEXT, 'joshua', 'asingua')).toBe(true)
    expect(checkStudyLoadNameMatch(SAMPLE_UC_STUDY_LOAD_TEXT, 'JOSHUA', 'ASINGUA')).toBe(true)
  })

  it('rejects mismatched names and sends to admin review', () => {
    expect(checkStudyLoadNameMatch(SAMPLE_UC_STUDY_LOAD_TEXT, 'Maria', 'Santos')).toBe(false)
    expect(checkStudyLoadNameMatch(SAMPLE_UC_STUDY_LOAD_TEXT, 'Joshua', 'Santos')).toBe(false)
    expect(checkStudyLoadNameMatch(SAMPLE_UC_STUDY_LOAD_TEXT, 'Maria', 'Asingua')).toBe(false)
  })

  it('handles empty or corrupt input safely', () => {
    expect(checkStudyLoadNameMatch('', 'Joshua', 'Asingua')).toBe(false)
    expect(checkStudyLoadNameMatch(SAMPLE_UC_STUDY_LOAD_TEXT, '', 'Asingua')).toBe(false)
    expect(checkStudyLoadNameMatch(SAMPLE_UC_STUDY_LOAD_TEXT, 'Joshua', '')).toBe(false)
  })
})

describe('resolveApplicantNames', () => {
  it('prefers explicit first and last name when set', () => {
    expect(resolveApplicantNames({ firstName: 'Joshua', lastName: 'Asingua', displayName: 'Other Name' })).toEqual({
      firstName: 'Joshua',
      lastName: 'Asingua',
    })
  })

  it('falls back to displayName for Google OAuth accounts missing first_name/last_name', () => {
    const resolved = resolveApplicantNames({ firstName: null, lastName: null, displayName: 'Joshua L. Asingua' })
    expect(resolved).toEqual({ firstName: 'Joshua L.', lastName: 'Asingua' })
    expect(checkStudyLoadNameMatch('ASINGUA, JOSHUA L. (23249600)', resolved.firstName, resolved.lastName)).toBe(true)
  })

  it('handles comma-separated displayName formats', () => {
    expect(resolveApplicantNames({ firstName: null, lastName: null, displayName: 'Asingua, Joshua L.' })).toEqual({
      firstName: 'Joshua L.',
      lastName: 'Asingua',
    })
  })
})
