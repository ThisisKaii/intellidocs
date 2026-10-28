import { useEffect, useState } from 'react'

/** Two-letter initials derived from the user's display name or email, or a fallback. */
export function userInitials(name: string): string {
  const parts = name.split('@')[0].split(/[\s._-]+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  const initials = parts[0]?.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase()
  return initials || 'U'
}

interface UserAvatarProps {
  /** Link to the profile photo; initials show when it is missing or fails to load. */
  src?: string | null
  /** Name or email the initials come from. */
  name: string
  /** Pixel size of the round avatar. */
  size?: number
}

/** A round profile photo with an initials fallback. */
export function UserAvatar({ src, name, size = 28 }: UserAvatarProps): JSX.Element {
  const [failed, setFailed] = useState(false)
  // A new link (just uploaded) deserves a fresh try.
  useEffect(() => setFailed(false), [src])

  const box = { width: size, height: size }
  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setFailed(true)}
        style={box}
        className="rounded-full object-cover select-none"
        referrerPolicy="no-referrer"
      />
    )
  }
  return (
    <span
      style={{ ...box, fontSize: Math.max(10, Math.round(size * 0.4)) }}
      className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold select-none"
    >
      {userInitials(name)}
    </span>
  )
}
