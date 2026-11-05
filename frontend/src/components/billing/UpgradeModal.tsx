import { useEffect, useState } from 'react'
import { Check, CreditCard, Gauge, HardDrive, Infinity as InfinityIcon, Loader2, ShieldCheck, Sparkles } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { api, type SubscriptionStatus } from '@/services/api'
import { useAuth } from '@/hooks/useAuth'
import { burstConfetti } from '@/lib/confetti'

/** How long the simulated payment gateway "processes" before confirming. */
const GATEWAY_DELAY_MS = 1500
const PRICE_LABEL = '₱249 / month'

const PERKS = [
  { icon: InfinityIcon, title: 'Unlimited storage', detail: 'No more 10–50 MB cap on your documents.' },
  { icon: Gauge, title: 'Priority ML suggestions', detail: 'Formatting predictions served ahead of the free queue.' },
  { icon: ShieldCheck, title: 'Extended originality checks', detail: 'Longer documents and more sources per scan.' },
  { icon: HardDrive, title: 'Everything in your current tier', detail: 'Verified student and professor tools stay unlocked.' },
] as const

type Step = 'perks' | 'checkout' | 'processing' | 'done'

/** Format an ISO date for billing copy, e.g. "December 5, 2026". */
export function formatBillingDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

/**
 * Mock Pro upgrade: perks, then a demo checkout (no payment details are collected or sent),
 * a simulated gateway delay, and a confetti confirmation. Updates the signed-in user's plan.
 */
export function UpgradeModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }): JSX.Element {
  const { refreshRole } = useAuth()
  const [step, setStep] = useState<Step>('perks')
  const [status, setStatus] = useState<SubscriptionStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setStep('perks')
      setError(null)
    }
  }, [open])

  async function confirmPurchase(): Promise<void> {
    setError(null)
    setStep('processing')
    try {
      const [result] = await Promise.all([
        api.billing.checkout(),
        new Promise((resolve) => window.setTimeout(resolve, GATEWAY_DELAY_MS)),
      ])
      setStatus(result)
      setStep('done')
      burstConfetti()
      void refreshRole()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed')
      setStep('checkout')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => step !== 'processing' && onOpenChange(next)}>
      <DialogContent hideClose={step === 'processing'} aria-busy={step === 'processing'}>
        {step === 'perks' && (
          <>
            <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
              <Sparkles className="size-3" /> IntelliDocs Pro
            </span>
            <DialogTitle>Write without limits</DialogTitle>
            <DialogDescription className="mt-1">Upgrade for more room and faster, deeper checks.</DialogDescription>
            <ul className="mt-5 flex flex-col gap-3">
              {PERKS.map(({ icon: Icon, title, detail }) => (
                <li key={title} className="flex gap-3">
                  <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                    <Icon className="size-4 text-primary" strokeWidth={1.75} />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{title}</span>
                    <span className="block text-xs text-muted-foreground">{detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex items-center justify-between gap-3">
              <span className="text-sm">
                <span className="text-xl font-semibold tabular-nums">{PRICE_LABEL.split(' ')[0]}</span>
                <span className="text-muted-foreground"> / month</span>
              </span>
              <button type="button" onClick={() => setStep('checkout')} className="btn-primary min-h-[44px] px-5 active:scale-[0.98]">
                Continue to checkout
              </button>
            </div>
          </>
        )}

        {(step === 'checkout' || step === 'processing') && (
          <>
            <DialogTitle>Checkout</DialogTitle>
            <DialogDescription className="mt-1">IntelliDocs Pro · {PRICE_LABEL} · cancel anytime</DialogDescription>
            <div role="note" className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              Demo mode: no payment is processed and no card details are collected.
            </div>
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-border p-4">
              <CreditCard className="size-5 text-muted-foreground" strokeWidth={1.75} />
              <div className="flex-1">
                <p className="text-sm font-medium">Demo test card</p>
                <p className="text-xs tabular-nums text-muted-foreground">•••• •••• •••• 4242 · 12/30</p>
              </div>
            </div>
            <dl className="mt-4 flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Pro (monthly)</dt><dd className="tabular-nums">{PRICE_LABEL.split(' ')[0]}</dd></div>
              <div className="flex justify-between border-t border-border pt-1.5 font-medium"><dt>Due today</dt><dd className="tabular-nums">{PRICE_LABEL.split(' ')[0]}</dd></div>
            </dl>
            {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setStep('perks')} disabled={step === 'processing'} className="min-h-[44px] rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-50">
                Back
              </button>
              <button type="button" onClick={() => { void confirmPurchase() }} disabled={step === 'processing'} className="btn-primary inline-flex min-h-[44px] items-center gap-2 px-5 active:scale-[0.98]">
                {step === 'processing' ? (<><Loader2 className="size-4 animate-spin" /> Processing payment…</>) : 'Confirm and subscribe'}
              </button>
            </div>
          </>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center py-2 text-center">
            <span className="inline-flex size-12 items-center justify-center rounded-full bg-green-500/15">
              <Check className="size-6 text-green-600" strokeWidth={2.5} />
            </span>
            <DialogTitle className="mt-4">You're on Pro</DialogTitle>
            <DialogDescription className="mt-1">
              Unlimited storage is active. Next billing date: {formatBillingDate(status?.renewsAt ?? null)}.
            </DialogDescription>
            <button type="button" onClick={() => onOpenChange(false)} className="btn-primary mt-6 min-h-[44px] px-6 active:scale-[0.98]">
              Start writing
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
