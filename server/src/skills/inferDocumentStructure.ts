/** Document archetypes the structure inference can recognize. */
export type InferredDocumentType =
  | 'academic_thesis'
  | 'ieee_manuscript'
  | 'apa_manuscript'
  | 'unknown'

export interface InferredDocumentStructure {
  type: InferredDocumentType
  /** Human-readable name of the detected archetype, e.g. 'Academic Thesis'. */
  typeLabel: string
  /** Academic preset key the document should adopt, or null when unknown. */
  presetKey: string | null
  /** Lowercase markers that produced the detection, for transparency. */
  matchedMarkers: string[]
}

/** Characters from the document opening inspected for classification. */
const STRUCTURE_SAMPLE_CHARS = 3000

interface TypeProfile {
  type: InferredDocumentType
  label: string
  presetKey: string
  markers: string[]
}

/**
 * Marker profiles, most thesis-specific first so equal scores favour the
 * thesis archetype. Markers are matched lowercase against the opening sample.
 */
const PROFILES: TypeProfile[] = [
  {
    type: 'academic_thesis',
    label: 'Academic Thesis',
    presetKey: 'uclm_capstone',
    markers: [
      'in partial fulfillment of the requirements',
      'degree of bachelor',
      'thesis',
      'adviser',
    ],
  },
  {
    type: 'ieee_manuscript',
    label: 'IEEE Manuscript',
    presetKey: 'ieee',
    markers: ['index terms', 'ieee', 'transactions on'],
  },
  {
    type: 'apa_manuscript',
    label: 'APA Manuscript',
    presetKey: 'apa_7th',
    markers: ['running head:', 'abstract', 'keywords:'],
  },
]

/** Lowercase and flatten the opening of the text so markers match reliably. */
function normalizeSample(text: string): string {
  return text.slice(0, STRUCTURE_SAMPLE_CHARS).toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Infer the academic archetype of an unformatted document from the markers in
 * its opening 3,000 characters. The profile with the most distinct markers
 * wins; ties favour the thesis profile. Returns type 'unknown' with no preset
 * key when nothing matches, so callers can safely skip the prompt.
 */
export function inferDocumentStructure(text: string): InferredDocumentStructure {
  const sample = normalizeSample(text)

  let best: TypeProfile | null = null
  let bestMarkers: string[] = []

  for (const profile of PROFILES) {
    const matched = profile.markers.filter((marker) => sample.includes(marker))
    if (matched.length > bestMarkers.length) {
      best = profile
      bestMarkers = matched
    }
  }

  if (!best) {
    return { type: 'unknown', typeLabel: 'Unknown', presetKey: null, matchedMarkers: [] }
  }

  return {
    type: best.type,
    typeLabel: best.label,
    presetKey: best.presetKey,
    matchedMarkers: bestMarkers,
  }
}
