import { z } from 'zod'

/**
 * Body for POST /billing/checkout. Strict: the mock checkout accepts no payment details, so any
 * extra field (a card number, a CVC) is rejected instead of silently passing through.
 */
export const checkoutSchema = z.object({ plan: z.literal('pro') }).strict()

export type CheckoutBody = z.infer<typeof checkoutSchema>
