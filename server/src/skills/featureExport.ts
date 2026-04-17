import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { fileURLToPath } from 'url'

const execFileAsync = promisify(execFile)

interface FeatureExportResult {
  stdout: string
  stderr: string
}

interface ExecFileFailure extends Error {
  stdout?: string
  stderr?: string
  code?: number | string
}

// Resolve the absolute path to ml/export_features.py
function resolveFeatureExportPath(): string {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  return path.resolve(__dirname, '../../../ml/export_features.py')
}

// Run the feature exporter in one-shot mode
export async function runFeatureExportOnce(): Promise<FeatureExportResult> {
  const pythonBin = process.env.PYTHON_BIN || 'python'
  const exporterPath = resolveFeatureExportPath()

  try {
    const { stdout, stderr } = await execFileAsync(pythonBin, [exporterPath], {
      env: { ...process.env },
    })
    return { stdout, stderr }
  } catch (error: unknown) {
    const failure = error as ExecFileFailure
    const details = failure.stderr || failure.message
    throw new Error(`Feature export failed: ${details}`)
  }
}