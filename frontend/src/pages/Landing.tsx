import { useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { LogoLockup } from '../components/Logo'
import { Sparkles, Brain, CheckCircle, GraduationCap, GripVertical } from 'lucide-react'

/** Draggable before/after comparison of a raw draft and its formatted page. */
function BeforeAfterShowcase(): JSX.Element {
  const [split, setSplit] = useState(52)
  const frameRef = useRef<HTMLDivElement | null>(null)

  /** Move the divider to the given viewport x position, clamped to 4–96%. */
  function moveSplit(clientX: number) {
    const frame = frameRef.current
    if (!frame) return
    const rect = frame.getBoundingClientRect()
    const pct = ((clientX - rect.left) / rect.width) * 100
    setSplit(Math.min(96, Math.max(4, pct)))
  }

  const paneLabel: React.CSSProperties = {
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--muted-foreground)',
    margin: '0 0 1rem',
    fontFamily: 'var(--font-mono)',
  }

  return (
    <section id="showcase" style={{ maxWidth: '900px', width: '100%', margin: '0 auto 5rem', padding: '0 2rem', boxSizing: 'border-box' }}>
      <div
        ref={frameRef}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          moveSplit(e.clientX)
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) moveSplit(e.clientX)
        }}
        style={{
          position: 'relative',
          height: '380px',
          borderRadius: '12px',
          overflow: 'hidden',
          cursor: 'ew-resize',
          touchAction: 'none',
          userSelect: 'none',
          backgroundColor: 'var(--card)',
          boxShadow: 'rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, rgba(0,0,0,0.06) 0px 16px 48px -8px',
        }}
      >
        {/* Before: raw draft */}
        <div style={{ position: 'absolute', inset: 0, clipPath: `inset(0 ${100 - split}% 0 0)`, backgroundColor: 'var(--background)', padding: '2.5rem 3rem' }}>
          <p style={paneLabel}>Before — raw draft</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', lineHeight: 2, color: 'var(--muted-foreground)', margin: 0, whiteSpace: 'pre-wrap' }}>
            {'chapter 1\n\nintroduction\n\nthe rapid growth of ai document editors created new ways to write. this study looks at how machines can learn the formatting habits of individual users and guess what they want next...'}
          </p>
        </div>

        {/* After: formatted by IntelliDocs */}
        <div style={{ position: 'absolute', inset: 0, clipPath: `inset(0 0 0 ${split}%)`, backgroundColor: 'var(--background)', padding: '2.5rem 3rem', display: 'flex', flexDirection: 'column' }}>
          <p style={paneLabel}>After — IntelliDocs</p>
          <p style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '1rem', fontWeight: 700, textAlign: 'center', margin: '0 0 1.25rem' }}>Chapter 1</p>
          <p style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '1.125rem', fontWeight: 700, margin: '0 0 0.75rem' }}>Introduction</p>
          <p style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '0.9375rem', lineHeight: 2, textAlign: 'justify', margin: 0, color: 'var(--foreground)' }}>
            The rapid growth of AI-driven document editors has created new opportunities for personalized formatting automation. This study examines how machine learning can observe individual user behaviour patterns and predict formatting preferences.
          </p>
          <span style={{ marginTop: 'auto', textAlign: 'center', fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '0.8125rem', color: 'var(--muted-foreground)' }}>1</span>
        </div>

        {/* Divider and drag handle */}
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${split}%`, width: '2px', backgroundColor: 'var(--primary)', transform: 'translateX(-1px)', pointerEvents: 'none' }} />
        <div
          role="slider"
          aria-label="Compare raw draft and formatted text"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(split)}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setSplit((s) => Math.max(4, s - 4))
            if (e.key === 'ArrowRight') setSplit((s) => Math.min(96, s + 4))
          }}
          style={{
            position: 'absolute',
            top: '50%',
            left: `${split}%`,
            transform: 'translate(-50%, -50%)',
            width: '38px',
            height: '38px',
            borderRadius: '50%',
            backgroundColor: 'var(--primary)',
            color: 'var(--primary-foreground)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'rgba(0,0,0,0.2) 0px 4px 12px',
            cursor: 'ew-resize',
          }}
        >
          <GripVertical style={{ width: '18px', height: '18px' }} />
        </div>
      </div>
      <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: '0.75rem 0 0' }}>
        Drag the handle to compare a raw draft with the same page after IntelliDocs formats it.
      </p>
    </section>
  )
}

const SUPERPOWERS = [
  {
    icon: Brain,
    title: 'Learns your style',
    color: '#0a72ef',
    desc: 'Every heading, indent, and citation you format teaches the editor. Suggestions get sharper with each document — no rules to configure.',
  },
  {
    icon: CheckCircle,
    title: 'Catches real academic errors',
    color: '#10b981',
    desc: 'Grammar, spelling, and citation slips are underlined right where you type, with one-click fixes that match academic writing.',
  },
  {
    icon: GraduationCap,
    title: 'Made for class and thesis work',
    color: '#de1d8d',
    desc: 'Students write with the same intelligent formatting engine professors review with, so feedback lands in context instead of email threads.',
  },
]

const TESTIMONIALS = [
  {
    quote: 'It picked up my chapter-heading style after two pages. Now it formats the next one before I even reach for the toolbar.',
    name: 'Mia S.',
    role: 'Computer Science student',
  },
  {
    quote: 'My students\u2019 papers come in with consistent margins, headings, and citations. Reviewing takes minutes instead of hours.',
    name: 'Prof. R. Dela Cruz',
    role: 'Research adviser',
  },
  {
    quote: 'I stopped fighting the toolbar. The suggestions feel like they come from an editor who already knows my habits.',
    name: 'J. Alvarez',
    role: 'Graduate researcher',
  },
]

/** Public landing page for IntelliDocs. */
export default function Landing(): JSX.Element {
  const { isAuthenticated, loading } = useAuth()

  if (!loading && isAuthenticated) return <Navigate to="/dashboard" replace />

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--background)', color: 'var(--foreground)', fontFamily: 'var(--font-sans)', fontFeatureSettings: '"liga"' }}>

      {/* Navbar */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2rem', height: '64px', backgroundColor: 'var(--background)', boxShadow: 'rgba(0,0,0,0.08) 0px 1px 0px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <LogoLockup size={28} />
        </div>
        <nav style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <Link to="/login" style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--muted-foreground)', textDecoration: 'none' }}>Log in</Link>
          <Link to="/register" style={{ fontSize: '0.875rem', fontWeight: 500, backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)', padding: '0.5rem 1rem', borderRadius: '6px', textDecoration: 'none' }}>Sign up</Link>
        </nav>
      </header>

      {/* Hero */}
      <section style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '6rem 2rem 5rem', maxWidth: '1200px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#ebf5ff', color: '#0068d6', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 500, marginBottom: '2rem' }}>
          <Sparkles style={{ width: '12px', height: '12px' }} />
          Learns how you format
        </div>
        <h1 style={{ fontSize: 'clamp(2.5rem, 6vw, 3rem)', fontWeight: 600, lineHeight: 1.0, letterSpacing: '-2.4px', margin: '0 0 1.5rem', maxWidth: '800px' }}>
          The document editor that learns you.
        </h1>
        <p style={{ fontSize: '1.25rem', fontWeight: 400, lineHeight: 1.8, color: 'var(--muted-foreground)', maxWidth: '650px', margin: '0 0 2.5rem' }}>
          Write naturally. IntelliDocs learns how you format your papers and turns hours of tedious manual styling into single-click suggestions.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link to="/register" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '44px', padding: '0 1.5rem', fontSize: '0.875rem', fontWeight: 500, backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)', borderRadius: '6px', textDecoration: 'none' }}>Start Writing</Link>
          <a href="#showcase" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '44px', padding: '0 1.5rem', fontSize: '0.875rem', fontWeight: 500, backgroundColor: 'transparent', color: 'var(--foreground)', borderRadius: '6px', textDecoration: 'none', boxShadow: 'var(--border-shadow) 0px 0px 0px 1px' }}>See it in action</a>
        </div>
      </section>

      {/* Interactive before/after showcase */}
      <BeforeAfterShowcase />

      <div style={{ borderTop: '1px solid var(--border)', maxWidth: '1200px', width: '100%', margin: '0 auto' }} />

      {/* Three superpowers */}
      <section id="features" style={{ maxWidth: '1200px', width: '100%', margin: '0 auto', padding: '5rem 2rem', boxSizing: 'border-box' }}>
        <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 600, letterSpacing: '-1.28px', lineHeight: 1.2, margin: '0 0 0.75rem' }}>Three superpowers, zero setup</h2>
          <p style={{ fontSize: '1.125rem', color: 'var(--muted-foreground)', lineHeight: 1.6, maxWidth: '520px', margin: '0 auto' }}>No rules to define, no styles to configure. IntelliDocs starts learning from your very first page.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
          {SUPERPOWERS.map((f) => (
            <div key={f.title} style={{ borderRadius: '8px', padding: '1.5rem', boxShadow: 'var(--border-shadow) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, var(--card-shadow-inner) 0px 0px 0px 1px inset', backgroundColor: 'var(--card)' }}>
              <f.icon style={{ width: '20px', height: '20px', color: f.color, marginBottom: '0.75rem' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 600, letterSpacing: '-0.32px', margin: '0 0 0.5rem' }}>{f.title}</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <div style={{ borderTop: '1px solid var(--border)', maxWidth: '1200px', width: '100%', margin: '0 auto' }} />

      {/* Testimonials */}
      <section style={{ maxWidth: '1200px', width: '100%', margin: '0 auto', padding: '5rem 2rem', boxSizing: 'border-box' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 600, letterSpacing: '-1.28px', lineHeight: 1.2, margin: '0 0 0.75rem' }}>Loved by students, not just developers</h2>
          <p style={{ fontSize: '1.125rem', color: 'var(--muted-foreground)', lineHeight: 1.6, maxWidth: '500px', margin: '0 auto' }}>What students, researchers, and professors say after a few weeks.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          {TESTIMONIALS.map((t) => (
            <figure key={t.name} style={{ margin: 0, borderRadius: '8px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', boxShadow: 'var(--border-shadow) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, var(--card-shadow-inner) 0px 0px 0px 1px inset', backgroundColor: 'var(--card)' }}>
              <blockquote style={{ margin: 0, fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--foreground)' }}>&ldquo;{t.quote}&rdquo;</blockquote>
              <figcaption style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginTop: 'auto' }}>
                <span style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--secondary)', color: 'var(--foreground)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 600, flexShrink: 0 }}>
                  {t.name.charAt(0)}
                </span>
                <span>
                  <span style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600 }}>{t.name}</span>
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>{t.role}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <div style={{ borderTop: '1px solid var(--border)', maxWidth: '1200px', width: '100%', margin: '0 auto' }} />

      {/* CTA */}
      <section style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '5rem 2rem' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 600, letterSpacing: '-1.28px', lineHeight: 1.2, margin: '0 0 0.75rem' }}>Ready to write smarter?</h2>
        <p style={{ fontSize: '1.125rem', color: 'var(--muted-foreground)', lineHeight: 1.6, maxWidth: '420px', margin: '0 auto 2rem' }}>Create your free account and let the editor learn how you write.</p>
        <Link to="/register" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '44px', padding: '0 2rem', fontSize: '0.875rem', fontWeight: 500, backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)', borderRadius: '6px', textDecoration: 'none' }}>Get Started</Link>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: 0 }}>© 2026 IntelliDocs — Capstone Research System</p>
        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem' }}>
          <Link to="/privacy" style={{ color: 'var(--muted-foreground)', textDecoration: 'underline' }}>Privacy Policy</Link>
        </div>
      </footer>
    </div>
  )
}
