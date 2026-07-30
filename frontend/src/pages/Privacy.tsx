import { Link } from 'react-router-dom'
import { FileText } from 'lucide-react'

/**
 * Privacy Policy page for IntelliDocs.
 * Required by Google OAuth for production app verification.
 * Accessible at /privacy — no authentication needed.
 */
export default function Privacy(): JSX.Element {
  const lastUpdated = 'July 30, 2026'

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--background)',
        color: 'var(--foreground)',
        fontFamily: 'inherit',
      }}
    >
      {/* Navbar */}
      <header
        style={{
          borderBottom: '1px solid var(--border)',
          padding: '0 2rem',
          height: '56px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          backgroundColor: 'var(--background)',
          zIndex: 100,
        }}
      >
        <Link
          to="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            textDecoration: 'none',
            color: 'var(--foreground)',
            fontWeight: 700,
            fontSize: '1rem',
          }}
        >
          <FileText style={{ width: '20px', height: '20px', color: 'var(--primary)' }} />
          IntelliDocs
        </Link>
        <Link
          to="/login"
          style={{
            fontSize: '0.875rem',
            color: 'var(--muted-foreground)',
            textDecoration: 'none',
          }}
        >
          Sign in
        </Link>
      </header>

      {/* Content */}
      <main
        style={{
          maxWidth: '720px',
          margin: '0 auto',
          padding: '4rem 2rem 6rem',
        }}
      >
        <h1
          style={{
            fontSize: '2rem',
            fontWeight: 700,
            letterSpacing: '-0.03em',
            marginBottom: '0.5rem',
          }}
        >
          Privacy Policy
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginBottom: '3rem' }}>
          Last updated: {lastUpdated}
        </p>

        <Section title="1. Overview">
          IntelliDocs is a capstone research system — an intelligent web-based document editor
          designed to learn individual user formatting behavior and suggest formatting automatically.
          This Privacy Policy explains what information we collect, how we use it, and how it is
          protected.
        </Section>

        <Section title="2. Information We Collect">
          <p style={{ margin: '0 0 0.75rem' }}>We collect the following types of information:</p>
          <ul style={{ paddingLeft: '1.25rem', margin: 0, lineHeight: 1.8 }}>
            <li>
              <strong>Account information</strong> — your name and email address, provided via
              email/password registration or Google OAuth sign-in.
            </li>
            <li>
              <strong>Document content</strong> — text and formatting of the documents you create
              and store within IntelliDocs.
            </li>
            <li>
              <strong>Formatting behavior</strong> — anonymized records of formatting actions you
              apply (e.g., "applied Bold to heading text") used to train your personal formatting
              prediction model.
            </li>
            <li>
              <strong>Usage data</strong> — basic session information such as login timestamps and
              feature interactions, used for system diagnostics and research analysis.
            </li>
          </ul>
        </Section>

        <Section title="3. How We Use Your Information">
          <ul style={{ paddingLeft: '1.25rem', margin: 0, lineHeight: 1.8 }}>
            <li>To create and manage your account.</li>
            <li>
              To operate the IntelliDocs editor — storing, displaying, and auto-saving your
              documents.
            </li>
            <li>
              To train a personal ML model that predicts your formatting preferences (this model is
              scoped to your account only).
            </li>
            <li>To provide grammar and spelling suggestions within the editor.</li>
            <li>
              For academic research purposes — aggregate, anonymized behavioral data may be used in
              the capstone research analysis.
            </li>
          </ul>
        </Section>

        <Section title="4. Google OAuth Sign-In">
          If you choose to sign in with Google, we receive your Google account name and email
          address. We do <strong>not</strong> access your Google Drive files, Gmail, Google Docs, or
          any other Google services unless you explicitly initiate a Google Drive import. We do not
          store your Google password. Authentication is handled securely via Supabase Auth and Google
          OAuth 2.0.
        </Section>

        <Section title="5. Data Storage and Security">
          <ul style={{ paddingLeft: '1.25rem', margin: 0, lineHeight: 1.8 }}>
            <li>
              Documents and user profiles are stored in Supabase (PostgreSQL) with Row Level
              Security (RLS) enabled — you can only access your own data.
            </li>
            <li>
              Formatting behavior events are processed through Redis and stored in DuckDB for ML
              training, scoped to your user ID.
            </li>
            <li>All data is transmitted over HTTPS.</li>
            <li>We do not sell your data to third parties.</li>
          </ul>
        </Section>

        <Section title="6. Data Retention">
          Your account data and documents are retained for the duration of your account. You may
          delete individual documents at any time from within the application. To request full
          account deletion, contact the developer at the email below.
        </Section>

        <Section title="7. Third-Party Services">
          IntelliDocs uses the following third-party services:
          <ul style={{ paddingLeft: '1.25rem', marginTop: '0.5rem', lineHeight: 1.8 }}>
            <li>
              <strong>Supabase</strong> — authentication and database hosting (
              <a
                href="https://supabase.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--primary)' }}
              >
                Privacy Policy
              </a>
              )
            </li>
            <li>
              <strong>Google OAuth</strong> — optional sign-in provider (
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--primary)' }}
              >
                Privacy Policy
              </a>
              )
            </li>
            <li>
              <strong>Vercel</strong> — frontend hosting (
              <a
                href="https://vercel.com/legal/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--primary)' }}
              >
                Privacy Policy
              </a>
              )
            </li>
          </ul>
        </Section>

        <Section title="8. Your Rights">
          You have the right to:
          <ul style={{ paddingLeft: '1.25rem', marginTop: '0.5rem', lineHeight: 1.8 }}>
            <li>Access the personal data we hold about you.</li>
            <li>Request correction of inaccurate data.</li>
            <li>Request deletion of your account and associated data.</li>
          </ul>
          To exercise any of these rights, contact us at the email address below.
        </Section>

        <Section title="9. Contact">
          This project is developed as a capstone research project. For any privacy-related
          inquiries, please contact:
          <br />
          <br />
          <strong>Joshua Asingua</strong>
          <br />
          <a
            href="mailto:joshuaasingua499@gmail.com"
            style={{ color: 'var(--primary)', textDecoration: 'none' }}
          >
            joshuaasingua499@gmail.com
          </a>
        </Section>

        <Section title="10. Changes to this Policy">
          We may update this Privacy Policy as IntelliDocs evolves. Changes will be posted on this
          page with an updated date at the top. Continued use of IntelliDocs after changes
          constitutes acceptance of the updated policy.
        </Section>

        <div
          style={{
            marginTop: '3rem',
            paddingTop: '2rem',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            gap: '1.5rem',
          }}
        >
          <Link to="/" style={{ fontSize: '0.875rem', color: 'var(--primary)', textDecoration: 'none' }}>
            ← Back to Home
          </Link>
          <Link
            to="/login"
            style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', textDecoration: 'none' }}
          >
            Sign In
          </Link>
        </div>
      </main>
    </div>
  )
}

/** Reusable section block with a title and body content. */
function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <section style={{ marginBottom: '2.25rem' }}>
      <h2
        style={{
          fontSize: '1.0625rem',
          fontWeight: 600,
          marginBottom: '0.625rem',
          color: 'var(--foreground)',
        }}
      >
        {title}
      </h2>
      <div
        style={{
          fontSize: '0.9375rem',
          lineHeight: 1.75,
          color: 'var(--muted-foreground)',
        }}
      >
        {children}
      </div>
    </section>
  )
}
