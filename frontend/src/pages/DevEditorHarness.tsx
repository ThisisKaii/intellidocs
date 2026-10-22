import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import { PagedEditor } from '@/components/editor/PagedEditor'
import { applyIeeeNumbering } from '@/components/editor/ieeeNumberingCommand'
import { convertToIeee } from '@/components/editor/ieeeConvertCommand'
import { ACADEMIC_PRESETS } from '@/components/editor/academicPresets'
import type { PageSizeKey } from '@/components/editor/TiptapEditor'
import type { GrammarIssue } from '@/services/api'
import { createDefaultHeaderFooterConfig } from '@/components/editor/HeaderFooterPlugin'

/** Fixture text long enough to force pagination onto a second page. */
const FIXTURE = `
<h1 data-doc-role="title">Adaptive Layout Formatting in Research Manuscripts</h1>
<p>A. Researcher, B. Advisor, and C. Colleague</p>
<h2 >Abstract</h2>
<p>This fixture exists so the IEEE conversion and numbering behaviour can be verified in a real browser without a database. It deliberately mixes author-block headings, ordinary section headings, subsections, subsubsections, and a nonstandard chapter heading so that leftover content handling can be observed directly in the rendered document.</p>
<h2 >Introduction</h2>
<p>Manuscript formatting is repetitive and predictable in ways that are difficult to capture with a fixed style sheet alone. Individual authors converge on a small number of habits, and those habits are what an intelligent editor should learn to anticipate.</p>
<p>The purpose of this harness is to confirm that the numbering command produces IEEE section labels and that the conversion command preserves content which does not match a known blueprint slot.</p>
<h2 >Background</h2>
<p>Prior work on automatic formatting prediction has generally relied on static rules. Such systems are predictable, but they do not adapt to the conventions of a particular author.</p>
<h3 >Prior Approaches</h3>
<p>Rule-based systems offer deterministic output and low inference cost, but they cannot represent the long tail of author-specific conventions.</p>
<h3 >Limitations</h3>
<p>Rule coverage degrades quickly once a manuscript departs from the template the rules were written against.</p>
<h4 >Coverage</h4>
<p>Rule authoring cost grows faster than the number of conventions captured.</p>
<h4 >Generalisation</h4>
<p>Rules derived from one corpus transfer poorly to a differently structured manuscript.</p>
<h2 >Method</h2>
<p>Behaviour events are captured from editor actions, buffered in Redis, and aggregated into DuckDB for downstream feature extraction and model training.</p>
<h3 >Event Capture</h3>
<p>Each toolbar action emits a structured event containing the format identifier, the document position, and a coarse structural context.</p>
<h3 >Feature Extraction</h3>
<p>Structural features are derived from the surrounding document rather than from the isolated selection.</p>
<h2 >Results</h2>
<p>Prediction accuracy improves as the number of accepted suggestions for a given document grows, because the per-user model is fine-tuned on those accepted events.</p>
<h3 >Accuracy</h3>
<p>Measured acceptance rate rises over successive sessions.</p>
<h2 >Conclusion</h2>
<p>A formatting model that learns an individual author behaviour is a narrow but tractable problem, and the result is measurable through an explicit accept and reject loop.</p>
<h2>Chapter 3: Discussion</h2>
<p>This heading intentionally does not match any IEEE blueprint slot so that the conversion command can be observed preserving it as leftover content.</p>
<h2>References</h2>
<p>[1] A. Researcher, "On predictive formatting," in Proc. Sample Conf., 2025, pp. 1-9.</p>
`

const IEEE_PAGE_SIZE: PageSizeKey = 'letter'
const IEEE_MARGINS = { top: 0.75, bottom: 0.75, left: 0.75, right: 0.75 }

/** The real Document page injects this preset CSS, so the harness must too. */
const IEEE_PRESET = ACADEMIC_PRESETS.find((preset) => preset.key === 'ieee')

/** Dev-only harness that mounts PagedEditor with no auth and no backend. */
export default function DevEditorHarness() {
  const [content, setContent] = useState(FIXTURE)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [spreadPreview, setSpreadPreview] = useState(false)
  const [html, setHtml] = useState('')

  /** Renders the live editor HTML into a hidden node for Playwright assertions. */
  const captureHtml = (next: string): void => {
    setContent(next)
    setHtml(next)
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {IEEE_PRESET && <style>{IEEE_PRESET.css}</style>}
      <div
        id="dev-controls"
        style={{ width: 220, padding: 12, borderRight: '1px solid #ccc', flexShrink: 0 }}
      >
        <button id="btn-numbering" onClick={() => editor && applyIeeeNumbering(editor)}>
          Renumber IEEE
        </button>
        <button id="btn-convert" onClick={() => editor && convertToIeee(editor)}>
          Convert to IEEE
        </button>
        <button
          id="btn-spread"
          onClick={() => setSpreadPreview((prev) => !prev)}
        >
          Toggle spread
        </button>
        <pre id="dev-html" style={{ fontSize: 10, overflow: 'auto', maxHeight: 400 }}>
          {html}
        </pre>
      </div>

      <div
        style={{
          position: 'relative',
          flex: 1,
          overflowY: 'auto',
          padding: '2rem 1rem',
        }}
      >
        <PagedEditor
          content={content}
          onContentChange={captureHtml}
          onActiveEditorChange={setEditor}
          onGrammarClick={() => undefined}
          grammarIssues={[] as GrammarIssue[]}
          underlineStyle="wavy"
          pageSize={IEEE_PAGE_SIZE}
          margins={IEEE_MARGINS}
          orientation="portrait"
          headerFooterConfig={createDefaultHeaderFooterConfig()}
          spreadPreview={spreadPreview}
        />
      </div>
    </div>
  )
}