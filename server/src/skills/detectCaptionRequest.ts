export type CaptionKind = 'figure' | 'table'

const FIGURE_WORDS = /\b(?:figures?|pictures?|images?|photos?|graphs?|charts?|diagrams?|illustrations?|screenshots?)\b/
const TABLE_WORDS = /\btables?\b/

/** "auto caption", "caption all the figures", "add captions to the tables", "insert missing captions". */
const AUTO_CAPTION = /\bauto[\s-]?caption/
const CAPTION_THEM =
  /\bcaption\s+(?:(?:all|the|my|any)\s+(?:of\s+)?(?:the\s+|my\s+)?(?:remaining\s+|uncaptioned\s+)?(?:figures|pictures|images|photos|graphs|charts|diagrams|illustrations|screenshots|tables)|(?:every|each)\s+(?:figure|picture|image|photo|graph|chart|diagram|illustration|screenshot|table))\b/
const ADD_CAPTIONS = /\b(?:add|insert|put|create|generate)\b[^.?!]{0,30}\bcaptions\b/
const MISSING_CAPTIONS = /\b(?:missing|uncaptioned)\s+captions?\b|\bcaptions?\s+(?:that\s+are\s+)?missing\b/
/** Styling words: "make the captions italic" is a formatting request, not one to add captions. */
const FORMATTING_WORDS = /\b(?:bold|italic\w*|underline\w*|cent(?:er|re)\w*|align\w*|justif\w*|font|size|bigger|smaller|larger|\d+\s*pt|spacing|indent\w*|style|color|colour)\b/

/**
 * A request to caption every figure and/or table that has none. Returns the kinds asked for
 * (both when the request names neither), or null when it is not such a request. The editor
 * does the work: numbering and style from the caption settings, titles only from the
 * document's own words (alt text, a table's title row), the rest left for the user to write.
 */
export function detectCaptionRequest(message: string): { kinds: CaptionKind[] } | null {
  const text = message.toLowerCase().replace(/\s+/g, ' ').trim()
  const asked = AUTO_CAPTION.test(text) || CAPTION_THEM.test(text) || ADD_CAPTIONS.test(text) || MISSING_CAPTIONS.test(text)
  if (!asked || FORMATTING_WORDS.test(text)) return null
  const figures = FIGURE_WORDS.test(text)
  const tables = TABLE_WORDS.test(text)
  if (figures && !tables) return { kinds: ['figure'] }
  if (tables && !figures) return { kinds: ['table'] }
  return { kinds: ['figure', 'table'] }
}
