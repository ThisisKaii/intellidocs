import { useEffect, useMemo, useState } from 'react'
import { api, type ClassSimilarityMatrix } from '@/services/api'

interface SimilarityMatrixProps {
  classFolderId: string
  onStudentSelect?: (studentId: string) => void
}

/** One rendered row: the student plus their similarity to every peer. */
interface MatrixRow {
  studentId: string
  studentName: string
  avatarColor: string
  similarities: Record<string, number>
}

/** Stable avatar colour per student id (darkened hues for AA white text). */
function getAvatarColor(userId: string): string {
  const colors = [
    '#b91c1c', '#1d4ed8', '#047857', '#b45309',
    '#6d28d9', '#be185d', '#0e7490', '#4d7c0f',
  ]
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0
  }
  return colors[hash % colors.length]
}

/** Heat colour for a similarity percentage (red = high, green = low). */
function getColorForSimilarity(sim: number): string {
  if (sim >= 80) return 'bg-red-500'
  if (sim >= 60) return 'bg-orange-500'
  if (sim >= 40) return 'bg-yellow-500'
  if (sim >= 20) return 'bg-green-500'
  return 'bg-gray-200'
}

/**
 * Class-wide pairwise similarity heatmap for a professor's class folder.
 * Data comes from the Express API (the council's plagiarism matches); the
 * matrix is built here purely for display.
 */
export function SimilarityMatrix({ classFolderId, onStudentSelect }: SimilarityMatrixProps): JSX.Element {
  const [data, setData] = useState<ClassSimilarityMatrix | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    if (!classFolderId) {
      setData(null)
      setError('')
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')

    api.professor
      .folderSimilarity(classFolderId)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (cancelled) return
        setData(null)
        setError(err instanceof Error ? err.message : 'Failed to load the similarity matrix')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [classFolderId])

  const rows: MatrixRow[] = useMemo(() => {
    if (!data) return []
    const pairMap = new Map<string, number>()
    for (const pair of data.pairs) {
      pairMap.set(`${pair.studentAId}|${pair.studentBId}`, pair.similarity)
    }

    return data.students.map((student) => {
      const similarities: Record<string, number> = {}
      for (const other of data.students) {
        if (other.studentId === student.studentId) {
          similarities[other.studentId] = 100
          continue
        }
        const [first, second] =
          student.studentId < other.studentId
            ? [student.studentId, other.studentId]
            : [other.studentId, student.studentId]
        similarities[other.studentId] = pairMap.get(`${first}|${second}`) ?? 0
      }
      return {
        studentId: student.studentId,
        studentName: student.studentName,
        avatarColor: getAvatarColor(student.studentId),
        similarities,
      }
    })
  }, [data])

  if (!classFolderId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <p className="text-lg font-medium text-foreground">Select a class folder</p>
        <p className="text-sm mt-1">Choose one of your class folders above to compare student submissions.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center px-6">
        <p className="text-sm font-medium text-destructive">{error}</p>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground text-center px-6">
        <p className="text-lg font-medium text-foreground">No submissions in this class folder yet</p>
        <p className="text-sm mt-1">Add student documents to the folder to see the similarity analysis.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <p className="text-sm text-muted-foreground mb-3">
        Cell colours indicate the strongest flagged passage similarity between two students (red = high, green = low).
      </p>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="min-w-full text-sm bg-card">
          <thead>
            <tr>
              <th className="w-40 p-2 text-left font-medium text-muted-foreground border-b border-border sticky left-0 bg-card z-10">
                Student
              </th>
              {rows.map((student) => (
                <th key={student.studentId} className="w-20 p-2 text-center font-medium text-muted-foreground border-b border-border">
                  <div className="flex items-center justify-center gap-1">
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ backgroundColor: student.avatarColor }}
                    >
                      {student.studentName.charAt(0).toUpperCase()}
                    </span>
                    <button
                      type="button"
                      title={student.studentName}
                      onClick={() => onStudentSelect?.(student.studentId)}
                      className="hidden sm:inline max-w-[80px] truncate bg-transparent border-none cursor-pointer text-muted-foreground hover:text-foreground font-medium text-xs p-0"
                    >
                      {student.studentName}
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((student, rowIndex) => (
              <tr key={student.studentId} className={rowIndex % 2 === 0 ? '' : 'bg-secondary/40'}>
                <td className="w-40 p-2 font-medium text-foreground sticky left-0 bg-card z-10 border-b border-border/40">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ backgroundColor: student.avatarColor }}
                    >
                      {student.studentName.charAt(0).toUpperCase()}
                    </span>
                    <button
                      type="button"
                      onClick={() => onStudentSelect?.(student.studentId)}
                      className="truncate bg-transparent border-none cursor-pointer text-foreground hover:text-primary font-medium text-sm p-0 text-left"
                    >
                      {student.studentName}
                    </button>
                  </div>
                </td>
                {rows.map((otherStudent) => {
                  const sim = student.similarities[otherStudent.studentId] ?? 0
                  return (
                    <td key={otherStudent.studentId} className="w-20 p-2 text-center border-b border-border/40">
                      <button
                        type="button"
                        className={`w-full h-8 rounded ${getColorForSimilarity(sim)} flex items-center justify-center text-xs font-medium tabular-nums text-white transition-colors border-none cursor-pointer`}
                        title={`${student.studentName} ↔ ${otherStudent.studentName}: ${sim}% similarity`}
                        onClick={() => onStudentSelect?.(student.studentId)}
                      >
                        {sim}%
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
