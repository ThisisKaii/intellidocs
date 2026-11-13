import { driveAuthUrlQuerySchema } from '../../../schemas/driveLinkSchemas'

describe('driveAuthUrlQuerySchema', () => {
  it('accepts no hint', () => {
    expect(driveAuthUrlQuerySchema.parse({})).toEqual({})
  })

  it('accepts and trims an email hint', () => {
    expect(driveAuthUrlQuerySchema.parse({ loginHint: '  someone@gmail.com ' })).toEqual({ loginHint: 'someone@gmail.com' })
  })

  it('rejects a hint that is not an email', () => {
    expect(driveAuthUrlQuerySchema.safeParse({ loginHint: 'not-an-email' }).success).toBe(false)
    expect(driveAuthUrlQuerySchema.safeParse({ loginHint: ['a@b.co', 'c@d.co'] }).success).toBe(false)
  })
})
