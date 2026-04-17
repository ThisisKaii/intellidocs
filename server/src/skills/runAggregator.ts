import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { fileURLToPath } from 'url'

const execFileAsync = promisify(execFile)

interface AggregatorResult {
  stdout: string
  stderr: string
}

interface ExecFileFailure extends Error {
  stdout?: string
  stderr?: string
  code?: number | string
}

// Resolve the absolute path to ml/aggregator.py
function resolveAggregatorPath(): string {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  return path.resolve(__dirname, '../../../ml/aggregator.py')
}

// Run the aggregator in one-shot mode
export async function runAggregatorOnce(): Promise<AggregatorResult> {
  const pythonBin = process.env.PYTHON_BIN || 'python'
  const aggregatorPath = resolveAggregatorPath()

  try {
    const { stdout, stderr } = await execFileAsync(pythonBin, [aggregatorPath], {
      env: { ...process.env, AGGREGATOR_RUN_ONCE: '1' },
    })
    return { stdout, stderr }
  } catch (error: unknown) {
    const failure = error as ExecFileFailure
    const details = failure.stderr || failure.message
    throw new Error(`Aggregator failed: ${details}`)
  }
}
