import { useState } from 'react'
import { api } from '@/services/api'

interface McpDebugPanelProps {
  documentId?: string
  documentContent: string
}

export default function McpDebugPanel({
  documentId,
  documentContent,
}: McpDebugPanelProps): JSX.Element {
  const [output, setOutput] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)

  async function runTool<T>(tool: string, args: Record<string, unknown>): Promise<void> {
    setLoading(true)
    try {
      const result = await api.mcp.callTool<T>(tool as never, args)
      setOutput(JSON.stringify(result, null, 2))
    } catch (error) {
      setOutput(error instanceof Error ? error.message : 'Tool call failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ borderRadius: '0.5rem', border: '1px solid var(--border)', padding: '0.75rem' }}>
      <p style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)', margin: '0 0 0.5rem' }}>
        MCP Debug
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <button
          type="button"
          disabled={loading}
          onClick={() => runTool('getUserProfile', {})}
          style={{
            fontSize: '0.75rem',
            padding: '0.5rem',
            borderRadius: '0.375rem',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--secondary)',
            color: 'var(--foreground)',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          Get User Profile
        </button>

        <button
          type="button"
          disabled={loading || !documentId}
          onClick={() => runTool('getDocumentContent', { documentId })}
          style={{
            fontSize: '0.75rem',
            padding: '0.5rem',
            borderRadius: '0.375rem',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--secondary)',
            color: 'var(--foreground)',
            cursor: loading || !documentId ? 'not-allowed' : 'pointer',
          }}
        >
          Get Document Content
        </button>

        <button
          type="button"
          disabled={loading}
          onClick={() => runTool('predictNextFormat', { text: documentContent })}
          style={{
            fontSize: '0.75rem',
            padding: '0.5rem',
            borderRadius: '0.375rem',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--secondary)',
            color: 'var(--foreground)',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          Predict Next Format
        </button>
      </div>

      {output ? (
        <pre style={{ marginTop: '0.75rem', fontSize: '0.6875rem', whiteSpace: 'pre-wrap', color: 'var(--muted-foreground)' }}>
          {output}
        </pre>
      ) : null}
    </div>
  )
}
