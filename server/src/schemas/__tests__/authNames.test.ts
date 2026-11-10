import { registerSchema, updateProfileSchema } from '../../../schemas/authSchemas'
import { namesMetadata, readAccountNames } from '../../utils/accountNames'

describe('registerSchema', () => {
  it('requires a first and last name', () => {
    expect(registerSchema.safeParse({ email: 'a@b.co', password: 'secret1' }).success).toBe(false)
    expect(registerSchema.safeParse({ email: 'a@b.co', password: 'secret1', first_name: ' ', last_name: 'Cruz' }).success).toBe(false)
    const ok = registerSchema.parse({ email: 'a@b.co', password: 'secret1', first_name: ' Ana ', last_name: 'Cruz' })
    expect(ok.first_name).toBe('Ana')
  })
})

describe('updateProfileSchema', () => {
  it('takes first and last name, or a display name from older clients', () => {
    expect(updateProfileSchema.parse({ first_name: 'Ana', last_name: 'Cruz' })).toEqual({ first_name: 'Ana', last_name: 'Cruz' })
    expect(updateProfileSchema.parse({ display_name: 'Ana C' })).toEqual({ display_name: 'Ana C' })
    expect(updateProfileSchema.safeParse({ first_name: 'Ana' }).success).toBe(false)
  })
})

describe('account names', () => {
  it('stores first, last and the combined display name', () => {
    expect(namesMetadata(' Ana ', 'Cruz')).toEqual({ first_name: 'Ana', last_name: 'Cruz', display_name: 'Ana Cruz' })
  })

  it('reads stored names, then Google fields', () => {
    expect(readAccountNames({ first_name: 'Ana', last_name: 'Cruz', display_name: 'Ana Cruz' })).toEqual({
      firstName: 'Ana',
      lastName: 'Cruz',
      displayName: 'Ana Cruz',
    })
    expect(readAccountNames({ given_name: 'Ben', family_name: 'Reyes', full_name: 'Ben Reyes' })).toEqual({
      firstName: 'Ben',
      lastName: 'Reyes',
      displayName: 'Ben Reyes',
    })
    expect(readAccountNames({ display_name: 'Legacy User' })).toEqual({ firstName: null, lastName: null, displayName: 'Legacy User' })
    expect(readAccountNames(null)).toEqual({ firstName: null, lastName: null, displayName: null })
  })
})
