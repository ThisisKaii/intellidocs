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
  /** Markers that on their own point to this type; each counts double. */
  strongMarkers?: string[]
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
    strongMarkers: ['abstract—', 'index terms—'],
  },
  {
    type: 'apa_manuscript',
    label: 'APA Manuscript',
    presetKey: 'apa_7th',
    markers: ['running head:', 'abstract', 'keywords:'],
  },
]

/** A line that is just the References heading (optionally numbered), which ends the front matter. */
const REFERENCES_HEADING = /^ *(?:[ivx]+\. *)?references *$/m

/**
 * Lowercase and flatten the opening of the text so markers match reliably.
 * The sample stops at the References heading: citations such as "IEEE Trans."
 * there say nothing about the manuscript's own style. Em/en-dash run-ins are
 * normalized to an em dash with no surrounding space.
 */
function normalizeSample(text: string): string {
  const opening = text.slice(0, STRUCTURE_SAMPLE_CHARS).toLowerCase()
  const cut = opening.search(REFERENCES_HEADING)
  return (cut > 0 ? opening.slice(0, cut) : opening)
    .replace(/\s+/g, ' ')
    .replace(/\s*[—–]\s*/g, '—')
}

/**
 * True when a marker is present. A plain "abstract" does not count when it is
 * the IEEE "Abstract—" run-in, and "keywords:" is only a hint of APA, so it
 * never counts on its own (see inferDocumentStructure).
 */
function hasMarker(sample: string, marker: string): boolean {
  if (marker === 'abstract') return /abstract(?!—)/.test(sample)
  return sample.includes(marker)
}

/**
 * Infer the academic archetype of an unformatted document from the markers in
 * its opening 3,000 characters (before any References heading). The profile
 * with the highest marker score (strong markers count double) wins; ties favour the thesis profile. Returns type 'unknown' with no preset
 * key when nothing matches, so callers can safely skip the prompt.
 */
export function inferDocumentStructure(text: string): InferredDocumentStructure {
  const sample = normalizeSample(text)

  let best: TypeProfile | null = null
  let bestMarkers: string[] = []
  let bestScore = 0

  for (const profile of PROFILES) {
    let matched = profile.markers.filter((marker) => hasMarker(sample, marker))
    // Keywords: appears in IEEE, ACM and thesis papers too, so it only supports APA.
    if (profile.type === 'apa_manuscript' && matched.every((marker) => marker === 'keywords:')) {
      matched = []
    }
    const strong = (profile.strongMarkers ?? []).filter((marker) => sample.includes(marker))
    const score = matched.length + strong.length * 2
    if (score > bestScore) {
      best = profile
      bestScore = score
      bestMarkers = [...matched, ...strong.filter((marker) => !matched.includes(marker))]
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
