import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Database,
  GraduationCap,
  Mail,
  Shield,
  ShieldCheck,
  Sparkles,
  UserCog,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { PageHeader } from '@/components/PageHeader'
import { ProfileSection } from '@/components/settings/ProfileSection'
import { EmailSection } from '@/components/settings/EmailSection'
import { PasswordSection } from '@/components/settings/PasswordSection'
import { TwoFactorAuthSection } from '@/components/settings/TwoFactorAuthSection'
import { ConnectedAccountsSection } from '@/components/settings/ConnectedAccountsSection'
import { EditorPersonalizationSection } from '@/components/settings/EditorPersonalizationSection'
import { FacultyApplicationSection } from '@/components/settings/FacultyApplicationSection'
import { DataSection } from '@/components/settings/DataSection'

type SectionKey = 'profile' | 'security' | 'editor' | 'applications' | 'data'

const SECTIONS: Array<{ key: SectionKey; label: string; icon: LucideIcon }> = [
  { key: 'profile', label: 'Profile', icon: UserCog },
  { key: 'security', label: 'Security', icon: ShieldCheck },
  { key: 'editor', label: 'Editor & AI', icon: Sparkles },
  { key: 'applications', label: 'Faculty access', icon: GraduationCap },
  { key: 'data', label: 'Data & account', icon: Database },
]

const ROLE_LABELS: Record<string, string> = {
  student: 'Student',
  professor: 'Professor',
  admin: 'Admin',
}

/** Verification status shown for professor accounts. */
function verificationLabel(status: string | undefined): string {
  switch (status) {
    case 'pending':
      return 'Pending review'
    case 'approved':
      return 'Approved'
    case 'rejected':
      return 'Rejected'
    default:
      return 'Not applicable'
  }
}

/** Read-only account facts: email, role, and professor verification. */
function AccountInfoSection(): JSX.Element {
  const { user } = useAuth()
  const role = user?.role ?? 'student'

  return (
    <section className="rounded-xl bg-card border border-border p-6 shadow-sm">
      <h2 className="text-base font-medium mb-4 flex items-center gap-2">
        <UserCog className="size-4 text-muted-foreground" strokeWidth={1.75} />
        Account info
      </h2>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Mail className="size-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
          <span className="text-sm text-muted-foreground w-28 shrink-0">Email</span>
          <span className="text-sm text-foreground break-all">{user?.email ?? '—'}</span>
        </div>
        <div className="flex items-center gap-3">
          <Shield className="size-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
          <span className="text-sm text-muted-foreground w-28 shrink-0">Role</span>
          <span className="text-sm text-foreground capitalize">{ROLE_LABELS[role] ?? role}</span>
        </div>
        {role === 'professor' && (
          <div className="flex items-center gap-3">
            <span className="size-4 shrink-0" />
            <span className="text-sm text-muted-foreground w-28 shrink-0">Verification</span>
            <span className="text-sm text-foreground capitalize">{verificationLabel(user?.verificationStatus)}</span>
          </div>
        )}
      </div>
    </section>
  )
}

/** Account settings: a side navigation chooses one group of sections at a time (`?section=`). */
export default function SettingsPage(): JSX.Element {
  const { user, updateUser } = useAuth()
  const [params, setParams] = useSearchParams()
  const requested = params.get('section')
  const section: SectionKey = SECTIONS.some((s) => s.key === requested) ? (requested as SectionKey) : 'profile'
  const role = user?.role ?? 'student'
  // Administrators already have every permission, so there is no faculty application for them.
  const sections = SECTIONS.filter((s) => !(s.key === 'applications' && role === 'admin'))

  return (
    <motion.div className="min-h-screen bg-background text-foreground" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground no-underline transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" strokeWidth={1.75} />
          Back to documents
        </Link>

        <div className="mt-4"><PageHeader title="Settings" description="Manage your profile, security and editor preferences." /></div>

        <div className="flex flex-col gap-6 md:flex-row">
          <nav aria-label="Settings sections" className="flex shrink-0 gap-1 overflow-x-auto md:w-48 md:flex-col md:self-start md:sticky md:top-6">
            {sections.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                aria-current={section === key ? 'page' : undefined}
                onClick={() => setParams(key === 'profile' ? {} : { section: key })}
                className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${section === key ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'}`}
              >
                <Icon className="size-4" strokeWidth={1.75} /> {label}
              </button>
            ))}
          </nav>

          <div className="flex min-w-0 flex-1 flex-col gap-6">
            {section === 'profile' && (
              <>
                <ProfileSection userDisplayName={user?.displayName ?? ''} email={user?.email ?? ''} avatarUrl={user?.avatarUrl ?? null} onSaved={updateUser} />
                <EmailSection email={user?.email ?? ''} onEmailChanged={(email) => updateUser({ email })} />
                <AccountInfoSection />
              </>
            )}
            {section === 'security' && (
              <>
                <PasswordSection />
                <TwoFactorAuthSection />
                <ConnectedAccountsSection />
              </>
            )}
            {section === 'editor' && <EditorPersonalizationSection />}
            {section === 'applications' && (
              <FacultyApplicationSection role={role} verificationStatus={user?.verificationStatus} requestedRole={user?.requestedRole ?? null} />
            )}
            {section === 'data' && <DataSection />}
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-8">
          Account authentication and multi-factor security are managed securely via Supabase Auth.
        </p>
      </div>
    </motion.div>
  )
}
