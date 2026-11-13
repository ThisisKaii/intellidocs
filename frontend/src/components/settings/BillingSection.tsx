import { useEffect, useState } from 'react'
import { CreditCard, Sparkles } from 'lucide-react'
import { api, type SubscriptionStatus } from '@/services/api'
import { useAuth } from '@/hooks/useAuth'
import { UpgradeModal, formatBillingDate } from '@/components/billing/UpgradeModal'
import { PlanBadge } from '@/components/billing/PlanBadge'
import { ConfirmDialog } from '@/components/settings/ConfirmDialog'

/** Mock billing management: current plan, next billing date, cancel and resume. */
export function BillingSection(): JSX.Element {
  const { refreshRole } = useAuth()
  const [status, setStatus] = useState<SubscriptionStatus | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [busy, setBusy] = useState(false)

  function load(): void {
    api.billing.get().then((next) => { setStatus(next); setLoadError(false) }).catch(() => setLoadError(true))
  }

  useEffect(load, [])

  async function run(action: () => Promise<SubscriptionStatus>): Promise<void> {
    setBusy(true)
    try {
      setStatus(await action())
      void refreshRole()
    } finally {
      setBusy(false)
    }
  }

  const isPro = status?.plan === 'pro'
  const cancelled = isPro && !!status?.canceledAt

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <h2 className="mb-4 flex items-center gap-2 text-base font-medium">
        <CreditCard className="size-4 text-muted-foreground" strokeWidth={1.75} />
        Plan &amp; billing
      </h2>

      {loadError && <p className="text-sm text-destructive">Couldn't load your subscription. Try again later.</p>}

      {status && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Current plan:</span>
            <span className="font-medium">{isPro ? 'IntelliDocs Pro' : 'Free'}</span>
            <PlanBadge plan={status.plan} />
          </div>

          {isPro ? (
            <>
              <p className="text-sm">
                {cancelled ? 'Pro ends on' : 'Next billing date:'}{' '}
                <span className="font-medium tabular-nums">{formatBillingDate(status.renewsAt)}</span>
                {cancelled && <span className="text-muted-foreground"> · you won't be charged again</span>}
              </p>
              <div>
                {cancelled ? (
                  <button type="button" disabled={busy} onClick={() => { void run(api.billing.resume) }} className="btn-primary min-h-[44px] px-5">
                    Resume subscription
                  </button>
                ) : (
                  <button type="button" disabled={busy} onClick={() => setConfirmCancel(true)} className="min-h-[44px] rounded-lg border border-border px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/5 disabled:opacity-50">
                    Cancel subscription
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-muted-foreground">Unlimited storage, priority ML suggestions and extended originality checks.</p>
              <button type="button" onClick={() => setUpgradeOpen(true)} className="btn-primary inline-flex min-h-[44px] items-center gap-2 px-5 active:scale-[0.98]">
                <Sparkles className="size-4" /> Upgrade to Pro
              </button>
            </div>
          )}
        </div>
      )}

      <UpgradeModal open={upgradeOpen} onOpenChange={(open) => { setUpgradeOpen(open); if (!open) load() }} />
      <ConfirmDialog
        open={confirmCancel}
        title="Cancel Pro?"
        confirmLabel="Cancel subscription"
        destructive
        busy={busy}
        onConfirm={() => { setConfirmCancel(false); void run(api.billing.cancel) }}
        onCancel={() => setConfirmCancel(false)}
      >
        You'll keep Pro until {formatBillingDate(status?.renewsAt ?? null)}. After that your account returns to your tier's storage quota.
      </ConfirmDialog>
    </section>
  )
}
