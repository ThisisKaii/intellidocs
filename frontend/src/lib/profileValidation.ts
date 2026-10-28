/** Largest profile photo the server accepts. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024

const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp']

/** Why a chosen picture can't be used as a profile photo, or null when it can. */
export function validateAvatarFile(file: { type: string; size: number }): string | null {
  if (!AVATAR_TYPES.includes(file.type)) return 'Use a PNG, JPG or WebP picture.'
  if (file.size > AVATAR_MAX_BYTES) return 'That picture is larger than 2 MB. Choose a smaller one.'
  return null
}

/** Result of checking the display name field against the saved name. */
export interface DisplayNameCheck {
  /** True when the field differs from the saved name, so saving makes sense. */
  changed: boolean
  /** What to tell the person, or null when the value is fine to save. */
  error: string | null
}

/** Check the display name the person typed against the one already saved. */
export function checkDisplayName(typed: string, saved: string): DisplayNameCheck {
  const trimmed = typed.trim()
  if (trimmed.length === 0) return { changed: saved.trim().length > 0, error: 'Display name cannot be empty.' }
  if (trimmed.length > 100) return { changed: true, error: 'Display name must be 100 characters or fewer.' }
  return { changed: trimmed !== saved.trim(), error: null }
}

/** The fields of the change-password form. */
export interface PasswordForm {
  /** True when the account already has a password (Google-only accounts are setting their first). */
  hasPassword: boolean
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

/** The shortest password the server accepts. */
export const MIN_PASSWORD_LENGTH = 8

/**
 * Everything wrong with the password form right now, in the order the person fills it in.
 * Mismatch is only reported once they started the confirm box, so the form is quiet at first.
 */
export function passwordProblems(form: PasswordForm): string[] {
  const problems: string[] = []
  if (form.hasPassword && !form.currentPassword) problems.push('Enter your current password.')
  if (form.newPassword.length > 0 && form.newPassword.length < MIN_PASSWORD_LENGTH) {
    problems.push(`New password needs at least ${MIN_PASSWORD_LENGTH} characters.`)
  }
  if (form.hasPassword && form.currentPassword && form.newPassword && form.currentPassword === form.newPassword) {
    problems.push('Choose a new password that is different from the current one.')
  }
  if (form.confirmPassword.length > 0 && form.confirmPassword !== form.newPassword) {
    problems.push('The two new passwords do not match.')
  }
  return problems
}

/** True when the form is complete and has no problems, so the button can be enabled. */
export function passwordFormReady(form: PasswordForm): boolean {
  return form.newPassword.length >= MIN_PASSWORD_LENGTH
    && form.confirmPassword.length > 0
    && (!form.hasPassword || form.currentPassword.length > 0)
    && passwordProblems(form).length === 0
}

/** Why the new email can't be used, or null when a confirmation link may be sent. */
export function checkNewEmail(typed: string, current: string): string | null {
  const next = typed.trim().toLowerCase()
  if (!next) return 'Enter the new email address.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(next)) return 'That does not look like an email address.'
  if (next === current.trim().toLowerCase()) return 'That is already your email address.'
  return null
}
