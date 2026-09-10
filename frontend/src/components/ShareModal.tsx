import { useEffect, useState } from 'react'
import { X, Link2, Copy, Trash2, Check } from 'lucide-react'
import { api, type DocumentShare, type DocumentShareLink, type SharePermission } from '@/services/api'

const PERMISSION_LABELS: Record<SharePermission, string> = {
  view: 'View',
  comment: 'Comment',
  edit: 'Edit',
}

interface ShareModalProps {
  documentId: string
  onClose: () => void
}

/** Modal for managing document shares (owner only). */
export default function ShareModal({ documentId, onClose }: ShareModalProps): JSX.Element {
  const [shares, setShares] = useState<DocumentShare[]>([])
  const [email, setEmail] = useState<string>('')
  const [permission, setPermission] = useState<SharePermission>('view')
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string>('')
  const [busy, setBusy] = useState<boolean>(false)
  const [shareLink, setShareLink] = useState<DocumentShareLink | null>(null)
  const [linkPermission, setLinkPermission] = useState<SharePermission>('view')
  const [linkBusy, setLinkBusy] = useState<boolean>(false)
  const [copied, setCopied] = useState<boolean>(false)

  /** Load both email shares and the copyable link for this document. */
  const loadAll = async (): Promise<void> => {
    const [list, link] = await Promise.all([
      api.documents.listShares(documentId),
      api.documents.getShareLink(documentId).catch(() => null),
    ])
    setShares(list)
    setShareLink(link)
    if (link?.share_token) setLinkPermission(link.share_permission)
  }

  useEffect(() => {
    setLoading(true)
    loadAll()
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load shares'))
      .finally(() => setLoading(false))
  }, [documentId])

  async function handleAddShare(): Promise<void> {
    const target = email.trim().toLowerCase()
    if (!target) return
    if (shares.some((s) => (s.pending_email ?? '').toLowerCase() === target)) {
      setError('That email is already on this document')
      return
    }
    setBusy(true)
    setError('')
    try {
      const created = await api.documents.share(documentId, target, permission)
      setShares((prev) => [...prev, created])
      setEmail('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to share document')
    } finally {
      setBusy(false)
    }
  }

  async function handleUpdatePermission(shareId: string, next: SharePermission): Promise<void> {
    setError('')
    try {
      await api.documents.updateShare(documentId, shareId, next)
      setShares((prev) => prev.map((s) => (s.share_id === shareId ? { ...s, permission: next } : s)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update permission')
    }
  }

  async function handleRemoveShare(shareId: string): Promise<void> {
    if (!window.confirm('Remove this collaborator?')) return
    setError('')
    try {
      await api.documents.removeShare(documentId, shareId)
      setShares((prev) => prev.filter((s) => s.share_id !== shareId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove share')
    }
  }

  /** Generate or replace the copyable share link. */
  async function handleCreateLink(): Promise<void> {
    setLinkBusy(true)
    setError('')
    try {
      const link = await api.documents.createShareLink(documentId, linkPermission)
      setShareLink(link)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create share link')
    } finally {
      setLinkBusy(false)
    }
  }

  /** Disable the copyable share link. */
  async function handleRevokeLink(): Promise<void> {
    setLinkBusy(true)
    setError('')
    try {
      await api.documents.revokeShareLink(documentId)
      setShareLink({ share_token: null, share_permission: linkPermission })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke share link')
    } finally {
      setLinkBusy(false)
    }
  }

  /** Build the full share URL and copy it to the clipboard. */
  async function handleCopyLink(): Promise<void> {
    if (!shareLink?.share_token) return
    const url = `${window.location.origin}/document/${documentId}?share=${shareLink.share_token}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.4)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          width: 'min(440px, 92vw)',
          maxHeight: '80vh',
          overflowY: 'auto',
          backgroundColor: 'var(--card)',
          borderRadius: '0.875rem',
          padding: '1.25rem',
          boxShadow: 'var(--border-shadow) 0px 0px 0px 1px, rgba(0,0,0,0.2) 0px 12px 36px',
          fontFamily: 'inherit',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 600, color: 'var(--foreground)' }}>
            Share document
          </h3>
          <button
            onClick={onClose}
            title="Close"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)' }}
          >
            <X style={{ width: '18px', height: '18px' }} />
          </button>
        </div>

        {error && (
          <div style={{ marginBottom: '0.75rem', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', backgroundColor: 'rgba(239,68,68,0.1)', color: 'var(--destructive, #dc2626)', fontSize: '0.8125rem' }}>
            {error}
          </div>
        )}

        {/* Copyable share link */}
        <div
          style={{
            marginBottom: '1rem',
            padding: '0.75rem',
            borderRadius: '0.625rem',
            backgroundColor: 'var(--secondary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <Link2 style={{ width: '14px', height: '14px', color: 'var(--foreground)' }} />
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--foreground)' }}>
              Share via link
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="text"
              readOnly
              value={shareLink?.share_token ? `${window.location.origin}/document/${documentId}?share=${shareLink.share_token}` : 'No link created yet'}
              onFocus={(e) => e.target.select()}
              style={{
                flex: 1,
                minWidth: 0,
                padding: '0.5rem 0.625rem',
                borderRadius: '0.5rem',
                border: 'none',
                boxShadow: '0 0 0 1px var(--border-shadow)',
                backgroundColor: 'var(--background)',
                color: 'var(--muted-foreground)',
                fontFamily: 'inherit',
                fontSize: '0.75rem',
              }}
            />
            {shareLink?.share_token ? (
              <>
                <button
                  onClick={() => { void handleCopyLink() }}
                  title="Copy link"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    padding: '0.45rem 0.625rem',
                    borderRadius: '0.5rem',
                    border: 'none',
                    backgroundColor: 'var(--primary)',
                    color: 'var(--primary-foreground)',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    flexShrink: 0,
                  }}
                >
                  {copied ? <Check style={{ width: '12px', height: '12px' }} /> : <Copy style={{ width: '12px', height: '12px' }} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button
                  onClick={() => { void handleRevokeLink() }}
                  disabled={linkBusy}
                  title="Disable link"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '30px',
                    height: '30px',
                    borderRadius: '0.5rem',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: 'var(--muted-foreground)',
                    cursor: linkBusy ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    flexShrink: 0,
                  }}
                >
                  <Trash2 style={{ width: '14px', height: '14px' }} />
                </button>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
                <select
                  value={linkPermission}
                  onChange={(e) => setLinkPermission(e.target.value as SharePermission)}
                  style={{
                    padding: '0.375rem 0.25rem',
                    borderRadius: '0.375rem',
                    border: 'none',
                    boxShadow: '0 0 0 1px var(--border-shadow)',
                    backgroundColor: 'var(--background)',
                    color: 'var(--foreground)',
                    fontFamily: 'inherit',
                    fontSize: '0.75rem',
                  }}
                >
                  <option value="view">{PERMISSION_LABELS.view}</option>
                  <option value="comment">{PERMISSION_LABELS.comment}</option>
                  <option value="edit">{PERMISSION_LABELS.edit}</option>
                </select>
                <button
                  onClick={() => { void handleCreateLink() }}
                  disabled={linkBusy}
                  style={{
                    padding: '0.45rem 0.625rem',
                    borderRadius: '0.5rem',
                    border: 'none',
                    backgroundColor: 'var(--primary)',
                    color: 'var(--primary-foreground)',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    cursor: linkBusy ? 'not-allowed' : 'pointer',
                    opacity: linkBusy ? 0.6 : 1,
                    fontFamily: 'inherit',
                  }}
                >
                  Create link
                </button>
              </div>
            )}
          </div>
          <div style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)', marginTop: '0.375rem' }}>
            Anyone with the link can open the document (requires login).
          </div>
        </div>

        {/* Add collaborator */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Collaborator email"
            style={{
              flex: 1,
              minWidth: 0,
              padding: '0.5rem 0.625rem',
              borderRadius: '0.5rem',
              border: 'none',
              boxShadow: '0 0 0 1px var(--border-shadow)',
              backgroundColor: 'var(--background)',
              color: 'var(--foreground)',
              fontFamily: 'inherit',
              fontSize: '0.8125rem',
            }}
          />
          <select
            value={permission}
            onChange={(e) => setPermission(e.target.value as SharePermission)}
            style={{
              padding: '0.5rem 0.375rem',
              borderRadius: '0.5rem',
              border: 'none',
              boxShadow: '0 0 0 1px var(--border-shadow)',
              backgroundColor: 'var(--background)',
              color: 'var(--foreground)',
              fontFamily: 'inherit',
              fontSize: '0.8125rem',
            }}
          >
            <option value="view">View</option>
            <option value="comment">Comment</option>
            <option value="edit">Edit</option>
          </select>
          <button
            onClick={() => { void handleAddShare() }}
            disabled={busy || !email.trim()}
            style={{
              padding: '0.5rem 0.875rem',
              borderRadius: '0.5rem',
              border: 'none',
              backgroundColor: 'var(--primary)',
              color: 'var(--primary-foreground)',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: busy || !email.trim() ? 'not-allowed' : 'pointer',
              opacity: busy || !email.trim() ? 0.6 : 1,
              fontFamily: 'inherit',
            }}
          >
            Share
          </button>
        </div>

        {/* Existing shares */}
        {loading ? (
          <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)' }}>Loading…</p>
        ) : shares.length === 0 ? (
          <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)' }}>
            Nobody has access yet. Add an email above to share this document.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {shares.map((s) => (
              <li
                key={s.share_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  padding: '0.5rem 0.625rem',
                  borderRadius: '0.5rem',
                  backgroundColor: 'var(--secondary)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.pending_email ?? `User ${s.shared_with?.slice(0, 8)}`}
                  </div>
                  {s.pending_email && (
                    <div style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)' }}>
                      Pending — will activate once that email registers
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
                  <select
                    value={s.permission}
                    onChange={(e) => { void handleUpdatePermission(s.share_id, e.target.value as SharePermission) }}
                    title="Change permission"
                    style={{
                      padding: '0.25rem 0.25rem',
                      borderRadius: '0.375rem',
                      border: 'none',
                      boxShadow: '0 0 0 1px var(--border-shadow)',
                      backgroundColor: 'var(--primary-light, var(--card))',
                      color: 'var(--foreground)',
                      fontFamily: 'inherit',
                      fontSize: '0.75rem',
                    }}
                  >
                    <option value="view">{PERMISSION_LABELS.view}</option>
                    <option value="comment">{PERMISSION_LABELS.comment}</option>
                    <option value="edit">{PERMISSION_LABELS.edit}</option>
                  </select>
                  <button
                    onClick={() => { void handleRemoveShare(s.share_id) }}
                    title="Remove access"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)' }}
                  >
                    <X style={{ width: '16px', height: '16px' }} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}