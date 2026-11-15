import { describe, expect, it } from 'vitest'

import { asksForMoreThanPermission, detectAutonomyRequest } from '../assistantAutonomy'

describe('asking the assistant to apply changes on its own', () => {
  it.each([
    'You have my permission to change things',
    'you can do it without asking me',
    'no need to ask for permission, just do it',
    'just apply them automatically',
    "don't ask me, go ahead",
    'turn on auto apply',
    'I give you permission',
    'stop asking for confirmation',
  ])('grants on "%s"', (message) => {
    expect(detectAutonomyRequest(message)).toBe('grant')
  })

  it.each([
    'ask me first from now on',
    'turn off auto apply',
    "don't apply anything without asking",
    'I take back my permission',
    'stop applying changes automatically',
  ])('revokes on "%s"', (message) => {
    expect(detectAutonomyRequest(message)).toBe('revoke')
  })

  it.each(['make the headings bold', 'center the title', 'what does APA say about margins?', 'ask the adviser about it'])(
    'ignores "%s"',
    (message) => {
      expect(detectAutonomyRequest(message)).toBeNull()
    },
  )

  it('tells a bare permission from one that also asks for a change', () => {
    expect(asksForMoreThanPermission('ok you can do it without asking')).toBe(false)
    expect(asksForMoreThanPermission('You have my permission')).toBe(false)
    expect(asksForMoreThanPermission('without asking, make every chapter heading bold and centered')).toBe(true)
  })
})
