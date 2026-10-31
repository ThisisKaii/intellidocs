/**
 * LaTeX to Word equation (OMML) for the DOCX export.
 *
 * Covers the constructs the Word importer produces and the editor's equations normally use:
 * fractions, scripts, pre-scripts, roots, sums and integrals with limits, bracket pairs, plain text
 * and common symbols. Anything else (accents, matrices, aligned blocks) is reported as unsupported
 * by returning null, so the export can write the LaTeX source as visible text instead of dropping
 * the equation.
 */
type Docx = typeof import('docx')
/** What the docx package accepts inside an equation. */
type Component = ConstructorParameters<Docx['MathFraction']>[0]['numerator'][number]

/** Thrown inside the parser for any construct without a Word equivalent here. */
class Unsupported extends Error {}

/** One parsed piece: literal text (merged into one run) or ready-made equation nodes. */
type Atom = { text: string } | { nodes: Component[] }

/** LaTeX commands that are one character in Word. */
const SYMBOLS: Readonly<Record<string, string>> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι',
  kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ',
  phi: 'φ', varphi: 'ϕ', chi: 'χ', psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π',
  Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  pm: '±', mp: '∓', times: '×', div: '÷', cdot: '·', ast: '∗', circ: '∘', bullet: '∙', oplus: '⊕', otimes: '⊗',
  leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡', sim: '∼', simeq: '≃', cong: '≅', propto: '∝',
  ll: '≪', gg: '≫', in: '∈', notin: '∉', ni: '∋', subset: '⊂', supset: '⊃', subseteq: '⊆', supseteq: '⊇', cup: '∪', cap: '∩',
  emptyset: '∅', setminus: '∖', rightarrow: '→', to: '→', leftarrow: '←', leftrightarrow: '↔', Rightarrow: '⇒', Leftarrow: '⇐',
  Leftrightarrow: '⇔', uparrow: '↑', downarrow: '↓', mapsto: '↦', forall: '∀', exists: '∃', neg: '¬', wedge: '∧', vee: '∨',
  infty: '∞', partial: '∂', nabla: '∇', hbar: 'ℏ', ell: 'ℓ', cdots: '⋯', ldots: '…', vdots: '⋮', ddots: '⋱', surd: '√',
}

/** Functions Word writes as upright names. */
const FUNCTION_NAMES = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'coth', 'log', 'ln', 'lg', 'exp',
  'det', 'dim', 'gcd', 'lim', 'max', 'min', 'sup', 'inf', 'arg', 'deg', 'ker', 'Pr',
])

/** Big operators other than the sum and integral, as their Word characters. */
const NARY_CHARS: Readonly<Record<string, string>> = {
  prod: '∏', coprod: '∐', iint: '∬', iiint: '∭', oint: '∮', bigcup: '⋃', bigcap: '⋂', bigvee: '⋁', bigwedge: '⋀',
}

/** Brackets Word draws as a pair, keyed by the opening and closing characters. */
const BRACKET_PAIRS: ReadonlyArray<readonly [string, string, 'MathRoundBrackets' | 'MathSquareBrackets' | 'MathCurlyBrackets' | 'MathAngledBrackets']> = [
  ['(', ')', 'MathRoundBrackets'],
  ['[', ']', 'MathSquareBrackets'],
  ['{', '}', 'MathCurlyBrackets'],
  ['⟨', '⟩', 'MathAngledBrackets'],
]

class Parser {
  private i = 0

  constructor(private readonly D: Docx, private readonly s: string) {}

  /** Parses the whole input. */
  parseAll(): Component[] {
    const parts = this.sequence()
    if (this.i < this.s.length) throw new Unsupported('stray closing brace')
    return parts
  }

  private skipSpaces(): void {
    while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i += 1
  }

  private peekCommand(): string | null {
    const found = /^\\([A-Za-z]+)/.exec(this.s.slice(this.i))
    return found ? found[1] : null
  }

  private run(text: string): Component {
    return new this.D.MathRun(text)
  }

  /** Atoms up to a closing brace, `\right` or the end; adjacent plain text becomes one run. */
  private sequence(): Component[] {
    const out: Component[] = []
    let pending = ''
    const flush = (): void => {
      if (pending) out.push(this.run(pending))
      pending = ''
    }
    for (;;) {
      this.skipSpaces()
      if (this.i >= this.s.length || this.s[this.i] === '}' || this.peekCommand() === 'right') break
      const atom = this.atomWithScripts()
      if ('text' in atom) {
        pending += atom.text
      } else {
        flush()
        out.push(...atom.nodes)
      }
    }
    flush()
    return out
  }

  /** One atom and the superscript/subscript that follow it. */
  private atomWithScripts(): Atom {
    this.skipSpaces()
    // "{}_{a}^{b}X": scripts before their base are Word's pre-scripts.
    if (this.s.startsWith('{}', this.i) && /^\{\}\s*[_^]/.test(this.s.slice(this.i))) {
      this.i += 2
      const { sub, sup } = this.scripts()
      return { nodes: [new this.D.MathPreSubSuperScript({ children: this.operand(), subScript: sub ?? [], superScript: sup ?? [] })] }
    }
    const atom = this.atom()
    const { sub, sup } = this.scripts()
    if (!sub && !sup) return atom
    const base = 'text' in atom ? [this.run(atom.text)] : atom.nodes
    if (sub && sup) return { nodes: [new this.D.MathSubSuperScript({ children: base, subScript: sub, superScript: sup })] }
    if (sup) return { nodes: [new this.D.MathSuperScript({ children: base, superScript: sup })] }
    return { nodes: [new this.D.MathSubScript({ children: base, subScript: sub ?? [] })] }
  }

  /** `^x`, `_x` or both, in either order. */
  private scripts(): { sub: Component[] | null; sup: Component[] | null } {
    let sub: Component[] | null = null
    let sup: Component[] | null = null
    for (;;) {
      this.skipSpaces()
      const mark = this.s[this.i]
      if (mark !== '^' && mark !== '_') break
      this.i += 1
      const argument = this.scriptArgument()
      if (mark === '^') sup = argument
      else sub = argument
    }
    return { sub, sup }
  }

  /** The argument of a script: a braced group or a single token. */
  private scriptArgument(): Component[] {
    this.skipSpaces()
    if (this.s[this.i] === '{') return this.group()
    const atom = this.atom()
    return 'text' in atom ? [this.run(atom.text)] : atom.nodes
  }

  /** The next atom (with its scripts) as nodes: the operand of a big operator or a pre-script. */
  private operand(): Component[] {
    const atom = this.atomWithScripts()
    return 'text' in atom ? [this.run(atom.text)] : atom.nodes
  }

  private group(): Component[] {
    if (this.s[this.i] !== '{') throw new Unsupported('expected a group')
    this.i += 1
    const parts = this.sequence()
    if (this.s[this.i] !== '}') throw new Unsupported('unclosed group')
    this.i += 1
    return parts
  }

  /** Raw text of a braced group, for `\text{...}`. */
  private rawGroup(): string {
    this.skipSpaces()
    if (this.s[this.i] !== '{') throw new Unsupported('expected a group')
    let depth = 0
    const start = this.i + 1
    for (; this.i < this.s.length; this.i += 1) {
      if (this.s[this.i] === '{') depth += 1
      else if (this.s[this.i] === '}') {
        depth -= 1
        if (depth === 0) break
      }
    }
    if (depth !== 0) throw new Unsupported('unclosed group')
    const text = this.s.slice(start, this.i)
    this.i += 1
    return text.replace(/\\([#$%&_{}])/g, '$1')
  }

  private atom(): Atom {
    this.skipSpaces()
    const char = this.s[this.i]
    if (char === undefined) throw new Unsupported('unexpected end')
    if (char === '{') return { nodes: this.group() }
    if (char === '\\') return this.command()
    if (char === '&' || char === '^' || char === '_') throw new Unsupported(`unexpected ${char}`)
    this.i += 1
    return { text: char }
  }

  private command(): Atom {
    const name = this.peekCommand()
    if (name === null) {
      // "\{", "\%", "\," ... : an escaped character.
      const escaped = this.s[this.i + 1]
      this.i += 2
      if (escaped === undefined) throw new Unsupported('dangling backslash')
      if (',;:! '.includes(escaped)) return { text: ' ' }
      if (escaped === '\\') throw new Unsupported('line break')
      return { text: escaped }
    }
    this.i += 1 + name.length
    if (name in SYMBOLS) return { text: SYMBOLS[name] }
    if (FUNCTION_NAMES.has(name)) return { text: name }
    switch (name) {
      case 'frac':
        return { nodes: [new this.D.MathFraction({ numerator: this.group(), denominator: this.group() })] }
      case 'sqrt': {
        this.skipSpaces()
        let degree: Component[] | undefined
        if (this.s[this.i] === '[') {
          const close = this.s.indexOf(']', this.i)
          if (close < 0) throw new Unsupported('unclosed root degree')
          const inner = new Parser(this.D, this.s.slice(this.i + 1, close)).parseAll()
          degree = inner
          this.i = close + 1
        }
        this.skipSpaces()
        return { nodes: [new this.D.MathRadical({ children: this.group(), degree })] }
      }
      case 'text':
      case 'mathrm':
      case 'mathbf':
      case 'operatorname':
      case 'textrm':
        return { text: this.rawGroup() }
      case 'sum': {
        const { sub, sup } = this.scripts()
        return { nodes: [new this.D.MathSum({ children: this.operand(), subScript: sub ?? undefined, superScript: sup ?? undefined })] }
      }
      case 'int': {
        const { sub, sup } = this.scripts()
        return { nodes: [new this.D.MathIntegral({ children: this.operand(), subScript: sub ?? undefined, superScript: sup ?? undefined })] }
      }
      case 'left':
        return this.brackets()
      case 'middle':
        return { text: this.delimiter() }
      default:
        if (name in NARY_CHARS) return { text: NARY_CHARS[name] }
        throw new Unsupported(`\\${name}`)
    }
  }

  /** One delimiter after `\left`, `\middle` or `\right`; "" for the invisible `.`. */
  private delimiter(): string {
    this.skipSpaces()
    const char = this.s[this.i]
    if (char === undefined) throw new Unsupported('missing delimiter')
    if (char === '\\') {
      const name = this.peekCommand()
      if (name) {
        this.i += 1 + name.length
        const named: Record<string, string> = { langle: '⟨', rangle: '⟩', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉', Vert: '‖', vert: '|' }
        if (name in named) return named[name]
        throw new Unsupported(`delimiter \\${name}`)
      }
      const escaped = this.s[this.i + 1]
      this.i += 2
      return escaped ?? ''
    }
    this.i += 1
    return char === '.' ? '' : char
  }

  /** `\left( ... \right)`: a Word bracket pair when the pair has one, else the characters around the content. */
  private brackets(): Atom {
    const open = this.delimiter()
    const content = this.sequence()
    if (this.peekCommand() !== 'right') throw new Unsupported('missing \\right')
    this.i += '\\right'.length
    const close = this.delimiter()
    const pair = BRACKET_PAIRS.find(([left, right]) => left === open && right === close)
    if (pair) return { nodes: [new this.D[pair[2]]({ children: content })] }
    const nodes: Component[] = []
    if (open) nodes.push(this.run(open))
    nodes.push(...content)
    if (close) nodes.push(this.run(close))
    return { nodes }
  }
}

/** Word equation parts for a LaTeX string, or null when it uses something Word cannot take from here. */
export function latexToMath(D: Docx, latex: string): Component[] | null {
  try {
    const parts = new Parser(D, latex).parseAll()
    return parts.length > 0 ? parts : null
  } catch (error) {
    if (error instanceof Unsupported) return null
    throw error
  }
}
