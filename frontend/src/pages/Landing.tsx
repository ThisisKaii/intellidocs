import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { FileText, Sparkles, Brain, CheckCircle, Zap, MessageSquare } from 'lucide-react'

/** Tab content for the feature showcase mockup. */
function GrammarTab() {
  return (
    <div style={{ padding: '2.5rem 3rem', minHeight: '260px', backgroundColor: 'var(--background)' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-0.96px', margin: '0 0 1rem' }}>1. Introduction</h2>
      <p style={{ fontSize: '1rem', lineHeight: 1.7, color: 'var(--muted-foreground)', margin: '0 0 1.25rem' }}>
        The rapid growth of AI-driven document editors has created new opportunities for personalized formatting automation. This paper explores how machine learning can observe individual user{' '}
        <span style={{ borderBottom: '2px dashed #ea580c', color: 'var(--foreground)', paddingBottom: '1px' }}>behaviur</span>{' '}
        patterns and predict formatting preferences.
      </p>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', backgroundColor: 'var(--card)', boxShadow: 'var(--border-shadow) 0px 0px 0px 1px, rgba(0,0,0,0.08) 0px 4px 12px', borderRadius: '8px', padding: '0.625rem 1rem' }}>
        <span style={{ fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0.125rem 0.5rem', borderRadius: '4px', backgroundColor: 'rgba(249,115,22,0.1)', color: '#ea580c' }}>Spelling</span>
        <span style={{ fontSize: '0.8125rem', textDecoration: 'line-through', color: 'var(--muted-foreground)' }}>behaviur</span>
        <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: '#10b981' }}>→ behaviour</span>
        <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--border)' }} />
        <div style={{ fontSize: '0.75rem', fontWeight: 500, backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)', padding: '0.25rem 0.75rem', borderRadius: '4px' }}>Accept</div>
      </div>
    </div>
  )
}

function ChatbotTab() {
  const msgs = [
    { role: 'user', text: 'Make the introduction paragraph bold and add a heading.' },
    { role: 'ai', text: 'I\'ll apply bold to the introduction and add a Heading 2. Here\'s a preview:' },
  ]
  return (
    <div style={{ display: 'flex', minHeight: '260px' }}>
      <div style={{ flex: 1, padding: '2rem 2.5rem', backgroundColor: 'var(--background)' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-0.96px', margin: '0 0 0.75rem' }}>1. Introduction</h2>
        <p style={{ fontSize: '1rem', lineHeight: 1.7, color: 'var(--muted-foreground)', margin: 0 }}>
          <span style={{ backgroundColor: 'rgba(10,114,239,0.08)', padding: '0.125rem 0' }}>The rapid growth of AI-driven document editors has created new opportunities for personalized formatting.</span>
        </p>
      </div>
      <div style={{ width: '240px', borderLeft: '1px solid var(--border)', backgroundColor: 'var(--card)', display: 'flex', flexDirection: 'column', padding: '0.75rem', gap: '0.5rem', fontSize: '0.8125rem' }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ padding: '0.5rem 0.625rem', borderRadius: '6px', backgroundColor: m.role === 'user' ? 'var(--secondary)' : 'transparent', color: m.role === 'user' ? 'var(--foreground)' : 'var(--muted-foreground)', lineHeight: 1.5 }}>
            <span style={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: m.role === 'user' ? 'var(--muted-foreground)' : '#0a72ef', display: 'block', marginBottom: '0.25rem' }}>{m.role === 'user' ? 'You' : 'IntelliDocs AI'}</span>
            {m.text}
          </div>
        ))}
        <div style={{ display: 'flex', gap: '0.375rem', marginTop: 'auto' }}>
          <div style={{ flex: 1, fontSize: '0.75rem', fontWeight: 500, textAlign: 'center', padding: '0.375rem', borderRadius: '4px', backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>Apply</div>
          <div style={{ fontSize: '0.75rem', fontWeight: 500, textAlign: 'center', padding: '0.375rem 0.5rem', borderRadius: '4px', boxShadow: 'var(--border-shadow) 0px 0px 0px 1px', color: 'var(--muted-foreground)' }}>Reject</div>
        </div>
      </div>
    </div>
  )
}

function BehaviorTab() {
  const actions = [
    { action: 'Bold applied', time: '2s ago', icon: '𝐁' },
    { action: 'Heading 2 set', time: '8s ago', icon: 'H2' },
    { action: 'Italic applied', time: '15s ago', icon: '𝐼' },
    { action: 'Bullet list created', time: '22s ago', icon: '•' },
  ]
  return (
    <div style={{ display: 'flex', minHeight: '260px' }}>
      <div style={{ flex: 1, padding: '2rem 2.5rem', backgroundColor: 'var(--background)' }}>
        <p style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)', margin: '0 0 0.75rem' }}>Live Behavior Feed</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {actions.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', borderRadius: '6px', boxShadow: 'var(--border-shadow) 0px 0px 0px 1px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600, width: '24px', textAlign: 'center', color: 'var(--foreground)' }}>{a.icon}</span>
              <span style={{ fontSize: '0.8125rem', color: 'var(--foreground)', flex: 1 }}>{a.action}</span>
              <span style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>{a.time}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ width: '200px', borderLeft: '1px solid var(--border)', backgroundColor: 'var(--card)', padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
        <p style={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)', margin: 0 }}>Model Confidence</p>
        <div style={{ fontSize: '2.5rem', fontWeight: 600, letterSpacing: '-2px', color: '#10b981' }}>87%</div>
        <p style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)', margin: 0, textAlign: 'center' }}>Based on 142 events</p>
        <div style={{ width: '100%', height: '4px', borderRadius: '2px', backgroundColor: 'var(--secondary)', marginTop: '0.5rem' }}>
          <div style={{ width: '87%', height: '100%', borderRadius: '2px', backgroundColor: '#10b981' }} />
        </div>
      </div>
    </div>
  )
}

function AutoFormatTab() {
  return (
    <div style={{ padding: '2.5rem 3rem', minHeight: '260px', backgroundColor: 'var(--background)' }}>
      <p style={{ fontSize: '1rem', lineHeight: 1.7, color: 'var(--muted-foreground)', margin: '0 0 1.5rem' }}>
        Based on your formatting patterns, IntelliDocs has detected that this paragraph is likely a section heading.
      </p>
      <div style={{ boxShadow: 'var(--border-shadow) 0px 0px 0px 1px, rgba(0,0,0,0.08) 0px 4px 12px', borderRadius: '8px', padding: '1rem', backgroundColor: 'var(--card)', maxWidth: '420px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0.125rem 0.5rem', borderRadius: '4px', backgroundColor: 'rgba(121,40,202,0.1)', color: '#7928ca' }}>Prediction</span>
          <span style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>92% confidence</span>
        </div>
        <div style={{ backgroundColor: 'var(--secondary)', borderRadius: '6px', padding: '0.75rem', marginBottom: '0.75rem' }}>
          <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: '0 0 0.25rem', textDecoration: 'line-through', opacity: 0.7 }}>Literature Review</p>
          <p style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--foreground)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: '#10b981', fontSize: '0.875rem' }}>→</span>
            <span>Literature Review</span>
            <span style={{ fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase', padding: '0.125rem 0.375rem', borderRadius: '4px', backgroundColor: 'rgba(10,114,239,0.1)', color: '#0a72ef' }}>H2</span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <div style={{ flex: 1, fontSize: '0.8125rem', fontWeight: 500, textAlign: 'center', padding: '0.5rem', borderRadius: '6px', backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>Accept</div>
          <div style={{ flex: 0.5, fontSize: '0.8125rem', fontWeight: 500, textAlign: 'center', padding: '0.5rem', borderRadius: '6px', boxShadow: 'var(--border-shadow) 0px 0px 0px 1px', color: 'var(--muted-foreground)' }}>Ignore</div>
        </div>
      </div>
    </div>
  )
}

const TABS = [
  { key: 'grammar', label: 'Grammar & Spelling', color: '#ea580c' },
  { key: 'chatbot', label: 'AI Chatbot', color: '#0a72ef' },
  { key: 'behavior', label: 'Behavior Learning', color: '#de1d8d' },
  { key: 'autoformat', label: 'Auto-Formatting', color: '#7928ca' },
] as const

/** Public landing page for IntelliDocs. */
export default function Landing(): JSX.Element {
  const { isAuthenticated, loading } = useAuth()
  const [activeTab, setActiveTab] = useState<string>('grammar')

  if (!loading && isAuthenticated) return <Navigate to="/dashboard" replace />

  const tabContent: Record<string, JSX.Element> = {
    grammar: <GrammarTab />,
    chatbot: <ChatbotTab />,
    behavior: <BehaviorTab />,
    autoformat: <AutoFormatTab />,
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--background)', color: 'var(--foreground)', fontFamily: 'var(--font-sans)', fontFeatureSettings: '"liga"' }}>

      {/* Navbar */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2rem', height: '64px', backgroundColor: 'var(--background)', boxShadow: 'rgba(0,0,0,0.08) 0px 1px 0px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1rem' }}>I</div>
          <span style={{ fontWeight: 600, fontSize: '1rem', letterSpacing: '-0.32px' }}>IntelliDocs</span>
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
          Capstone Research System
        </div>
        <h1 style={{ fontSize: 'clamp(2.5rem, 6vw, 3rem)', fontWeight: 600, lineHeight: 1.0, letterSpacing: '-2.4px', margin: '0 0 1.5rem', maxWidth: '800px' }}>
          The editor that learns<br />your formatting.
        </h1>
        <p style={{ fontSize: '1.25rem', fontWeight: 400, lineHeight: 1.8, color: 'var(--muted-foreground)', maxWidth: '600px', margin: '0 0 2.5rem' }}>
          IntelliDocs watches how you format documents and predicts your next move. Grammar checking, spell checking, and ML-powered suggestions — all in one editor.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link to="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '44px', padding: '0 1.5rem', fontSize: '0.875rem', fontWeight: 500, backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)', borderRadius: '6px', textDecoration: 'none' }}>Start Writing</Link>
          <a href="#features" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '44px', padding: '0 1.5rem', fontSize: '0.875rem', fontWeight: 500, backgroundColor: 'transparent', color: 'var(--foreground)', borderRadius: '6px', textDecoration: 'none', boxShadow: 'var(--border-shadow) 0px 0px 0px 1px' }}>Learn More</a>
        </div>
      </section>

      {/* Tabbed Editor Mockup */}
      <section style={{ maxWidth: '900px', width: '100%', margin: '0 auto 5rem', padding: '0 2rem', boxSizing: 'border-box' }}>
        {/* Tab buttons */}
        <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '-1px', position: 'relative', zIndex: 1, flexWrap: 'wrap' }}>
          {TABS.map(tab => (
            <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} style={{
              fontSize: '0.75rem', fontWeight: 500, padding: '0.5rem 1rem', borderRadius: '8px 8px 0 0', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              backgroundColor: activeTab === tab.key ? 'var(--card)' : 'transparent',
              color: activeTab === tab.key ? tab.color : 'var(--muted-foreground)',
              boxShadow: activeTab === tab.key ? 'var(--border-shadow) 0px 0px 0px 1px' : 'none',
              transition: 'color 150ms, background-color 150ms',
            }}>{tab.label}</button>
          ))}
        </div>
        {/* Mockup frame */}
        <div style={{ borderRadius: '0 12px 12px 12px', overflow: 'hidden', boxShadow: 'rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, rgba(0,0,0,0.06) 0px 16px 48px -8px' }}>
          <div style={{ height: '44px', backgroundColor: 'var(--card)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 1rem', gap: '0.5rem' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ff5b4f', opacity: 0.8 }} />
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#febc2e', opacity: 0.8 }} />
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#28c840', opacity: 0.8 }} />
            <span style={{ marginLeft: '0.75rem', fontSize: '0.75rem', fontWeight: 500, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>Research_Proposal.idoc</span>
          </div>
          {tabContent[activeTab]}
        </div>
      </section>

      <div style={{ borderTop: '1px solid var(--border)', maxWidth: '1200px', width: '100%', margin: '0 auto' }} />

      {/* Features */}
      <section id="features" style={{ maxWidth: '1200px', width: '100%', margin: '0 auto', padding: '5rem 2rem', boxSizing: 'border-box' }}>
        <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 600, letterSpacing: '-1.28px', lineHeight: 1.2, margin: '0 0 0.75rem' }}>Built for intelligent writing</h2>
          <p style={{ fontSize: '1.125rem', color: 'var(--muted-foreground)', lineHeight: 1.6, maxWidth: '500px', margin: '0 auto' }}>Every feature maps to a research question. Every interaction generates data.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
          {[
            { icon: Brain, title: 'ML Formatting Prediction', desc: 'Pre-trained on WikiText-103, then fine-tuned on your behavior. Predictions improve with every accept or reject.', color: '#0a72ef' },
            { icon: CheckCircle, title: 'Grammar & Spell Check', desc: 'Trained on the JFLEG dataset with inline suggestions that appear exactly where you need them.', color: '#10b981' },
            { icon: Sparkles, title: 'Confidence Scoring', desc: 'Every suggestion comes with a confidence score so you always know how sure the model is.', color: '#de1d8d' },
            { icon: Zap, title: 'Real-time Behavior Tracking', desc: 'Redis captures every formatting action. DuckDB aggregates patterns. The model learns continuously.', color: '#ea580c' },
            { icon: FileText, title: 'Custom Editor from Scratch', desc: 'Built on the contentEditable API — no third-party editor libraries. Full control over every interaction.', color: '#7928ca' },
            { icon: MessageSquare, title: 'AI Chatbot Assistant', desc: 'An MCP-powered chatbot that can read your document, apply formatting, and explain every suggestion.', color: '#ff5b4f' },
          ].map((f) => (
            <div key={f.title} style={{ borderRadius: '8px', padding: '1.5rem', boxShadow: 'var(--border-shadow) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, var(--card-shadow-inner) 0px 0px 0px 1px inset', backgroundColor: 'var(--card)' }}>
              <f.icon style={{ width: '20px', height: '20px', color: f.color, marginBottom: '0.75rem' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 600, letterSpacing: '-0.32px', margin: '0 0 0.5rem' }}>{f.title}</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <div style={{ borderTop: '1px solid var(--border)', maxWidth: '1200px', width: '100%', margin: '0 auto' }} />

      {/* Pipeline */}
      <section style={{ maxWidth: '1200px', width: '100%', margin: '0 auto', padding: '5rem 2rem', boxSizing: 'border-box' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 600, letterSpacing: '-1.28px', lineHeight: 1.2, margin: '0 0 0.75rem' }}>How IntelliDocs learns</h2>
          <p style={{ fontSize: '1.125rem', color: 'var(--muted-foreground)', lineHeight: 1.6, maxWidth: '500px', margin: '0 auto' }}>A three-stage pipeline from behavior to prediction.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
          {[
            { step: '01', label: 'Observe', color: '#0a72ef', desc: 'Every bold, heading, or indent you apply is captured as a behavior event in Redis.' },
            { step: '02', label: 'Aggregate', color: '#de1d8d', desc: 'Events are flushed to DuckDB for feature extraction and pattern analysis.' },
            { step: '03', label: 'Predict', color: '#ff5b4f', desc: 'The ML model predicts your next formatting action with a confidence score.' },
          ].map(item => (
            <div key={item.step} style={{ borderRadius: '8px', padding: '1.5rem', boxShadow: 'var(--border-shadow) 0px 0px 0px 1px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 500, textTransform: 'uppercase', color: item.color, marginBottom: '0.75rem', letterSpacing: '0.05em' }}>{item.step} — {item.label}</div>
              <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', lineHeight: 1.6, margin: 0 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <div style={{ borderTop: '1px solid var(--border)', maxWidth: '1200px', width: '100%', margin: '0 auto' }} />

      {/* CTA */}
      <section style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '5rem 2rem' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 600, letterSpacing: '-1.28px', lineHeight: 1.2, margin: '0 0 0.75rem' }}>Ready to write smarter?</h2>
        <p style={{ fontSize: '1.125rem', color: 'var(--muted-foreground)', lineHeight: 1.6, maxWidth: '420px', margin: '0 auto 2rem' }}>Create an account and start building your personal formatting model.</p>
        <Link to="/register" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '44px', padding: '0 2rem', fontSize: '0.875rem', fontWeight: 500, backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)', borderRadius: '6px', textDecoration: 'none' }}>Get Started</Link>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '2rem', textAlign: 'center' }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: 0 }}>© 2026 IntelliDocs — Capstone Research System</p>
      </footer>
    </div>
  )
}
