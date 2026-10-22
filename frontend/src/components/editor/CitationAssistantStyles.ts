import type { CSSProperties } from 'react'

/** Citation Assistant - Style constants extracted for TypeScript parser clarity. */

export const panelStyle: CSSProperties = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '0.5rem',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minHeight: 0,
  width: '100%',
}

export const tabsStyle: CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid var(--border)',
  backgroundColor: 'var(--secondary)',
}

export const tabStyle: CSSProperties = {
  padding: '0.5rem 1rem',
  border: 'none',
  borderRadius: 0,
  fontSize: '0.75rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  cursor: 'pointer',
  transition: 'background-color 120ms, color 120ms',
}

export const styleSelectorStyle: CSSProperties = {
  padding: '0.75rem 1rem',
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
}

export const labelStyle: CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 600,
  color: 'var(--muted-foreground)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

export const selectStyle: CSSProperties = {
  padding: '0.375rem 0.75rem',
  borderRadius: '0.375rem',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--background)',
  color: 'var(--foreground)',
  fontSize: '0.8125rem',
  fontFamily: 'inherit',
  cursor: 'pointer',
}

export const contentStyle: CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '0.75rem',
}

export const searchStyle: CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  borderRadius: '0.375rem',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--background)',
  color: 'var(--foreground)',
  fontSize: '0.8125rem',
  fontFamily: 'inherit',
  marginBottom: '0.75rem',
  boxSizing: 'border-box',
}

export const emptyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '2rem 1rem',
  textAlign: 'center',
  color: 'var(--muted-foreground)',
}

export const listStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
}

export const itemStyle: CSSProperties = {
  padding: '0.5rem',
  borderRadius: '0.375rem',
  border: '1px solid var(--border)',
  marginBottom: '0.5rem',
  backgroundColor: 'var(--background)',
}

export const refRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '0.5rem',
}

export const refTypeIconStyle: CSSProperties = {
  width: '24px',
  height: '24px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  marginTop: '0.125rem',
}

export const refInfoStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.125rem',
}

export const refTitleStyle: CSSProperties = {
  fontSize: '0.8125rem',
  fontWeight: 500,
  color: 'var(--foreground)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

export const refMetaStyle: CSSProperties = {
  fontSize: '0.6875rem',
  color: 'var(--muted-foreground)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

export const insertButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  borderRadius: '0.375rem',
  border: 'none',
  backgroundColor: 'var(--primary)',
  color: 'var(--primary-foreground)',
  cursor: 'pointer',
  flexShrink: 0,
  transition: 'background-color 120ms',
}

export const actionsStyle: CSSProperties = {
  display: 'flex',
  gap: '0.25rem',
  flexShrink: 0,
}

export const actionButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  borderRadius: '0.375rem',
  border: 'none',
  backgroundColor: 'transparent',
  color: 'var(--muted-foreground)',
  cursor: 'pointer',
  transition: 'background-color 120ms, color 120ms',
}

export const manageHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '1rem',
}

export const manageTitleStyle: CSSProperties = {
  fontSize: '0.875rem',
  fontWeight: 600,
  color: 'var(--foreground)',
  margin: 0,
}

export const addButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.375rem',
  padding: '0.375rem 0.75rem',
  borderRadius: '0.375rem',
  border: 'none',
  backgroundColor: 'var(--primary)',
  color: 'var(--primary-foreground)',
  fontSize: '0.8125rem',
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background-color 120ms',
}

export const groupStyle: CSSProperties = {
  marginBottom: '1rem',
}

export const groupLabelStyle: CSSProperties = {
  fontSize: '0.6875rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--muted-foreground)',
  marginBottom: '0.5rem',
  display: 'flex',
  alignItems: 'center',
}

export const bibliographyHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '1rem',
  paddingBottom: '0.75rem',
  borderBottom: '1px solid var(--border)',
}

export const bibliographyListStyle: CSSProperties = {
  paddingLeft: '1.5rem',
  margin: 0,
  fontSize: '0.8125rem',
  lineHeight: 1.7,
  color: 'var(--foreground)',
}

export const bibliographyItemStyle: CSSProperties = {
  marginBottom: '0.75rem',
  paddingLeft: '0.5rem',
  textIndent: '-0.5rem',
}

export const dialogOverlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '1rem',
}

export const dialogStyle: CSSProperties = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '0.5rem',
  width: '100%',
  maxWidth: '600px',
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: '0 16px 48px rgba(0, 0, 0, 0.2)',
}

export const dialogHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '1rem 1.25rem',
  borderBottom: '1px solid var(--border)',
}

export const dialogTitleStyle: CSSProperties = {
  fontSize: '0.875rem',
  fontWeight: 600,
  color: 'var(--foreground)',
  margin: 0,
}

export const closeButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  borderRadius: '0.375rem',
  border: 'none',
  backgroundColor: 'transparent',
  color: 'var(--muted-foreground)',
  fontSize: '1.25rem',
  cursor: 'pointer',
  transition: 'background-color 120ms, color 120ms',
}

export const dialogContentStyle: CSSProperties = {
  padding: '1.25rem',
}

export const formGroupStyle: CSSProperties = {
  marginBottom: '1rem',
}

export const authorRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.375rem',
}

export const inputStyle: CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  borderRadius: '0.375rem',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--background)',
  color: 'var(--foreground)',
  fontSize: '0.8125rem',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

export const removeAuthorButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  borderRadius: '0.375rem',
  border: 'none',
  backgroundColor: 'transparent',
  color: 'var(--muted-foreground)',
  cursor: 'pointer',
  transition: 'background-color 120ms, color 120ms',
}

export const addAuthorButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.375rem',
  padding: '0.375rem 0.75rem',
  borderRadius: '0.375rem',
  border: '1px dashed var(--border)',
  backgroundColor: 'transparent',
  color: 'var(--muted-foreground)',
  fontSize: '0.8125rem',
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background-color 120ms, color 120ms, border-color 120ms',
}

export const dialogFooterStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '0.5rem',
  padding: '1rem 1.25rem',
  borderTop: '1px solid var(--border)',
}

export const cancelButtonStyle: CSSProperties = {
  padding: '0.5rem 1rem',
  borderRadius: '0.375rem',
  border: '1px solid var(--border)',
  backgroundColor: 'transparent',
  color: 'var(--foreground)',
  fontSize: '0.8125rem',
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background-color 120ms',
}

export const saveButtonStyle: CSSProperties = {
  padding: '0.5rem 1rem',
  borderRadius: '0.375rem',
  border: 'none',
  backgroundColor: 'var(--primary)',
  color: 'var(--primary-foreground)',
  fontSize: '0.8125rem',
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background-color 120ms',
}