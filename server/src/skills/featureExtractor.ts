import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { fileURLToPath } from 'url'

const execFileAsync = promisify(execFile)

interface FeatureExtractorResult {
  stdout: string
  stderr: string
}

interface ExecFileFailure extends Error {
  stdout?: string
  stderr?: string
  code?: number | string
}

// Resolve the absolute path to ml/feature_extractor.py
function resolveFeatureExtractorPath(): string {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  return path.resolve(__dirname, '../../../ml/feature_extractor.py')
}

// Run the feature extractor in one-shot mode
export async function runFeatureExtractorOnce(): Promise<FeatureExtractorResult> {
  const pythonBin = process.env.PYTHON_BIN || 'python'
  const extractorPath = resolveFeatureExtractorPath()

  try {
    const { stdout, stderr } = await execFileAsync(pythonBin, [extractorPath], {
      env: { ...process.env },
    })
    return { stdout, stderr }
  } catch (error: unknown) {
    const failure = error as ExecFileFailure
    const details = failure.stderr || failure.message
    throw new Error(`Feature extractor failed: ${details}`)
  }
}
