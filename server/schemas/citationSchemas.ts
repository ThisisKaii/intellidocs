import { z } from 'zod'

/** Validate a citation lookup: a DOI, a doi.org link, or words from the title. */
export const lookupCitationSchema = z.object({
  query: z
    .string()
    .trim()
    .min(3, 'Enter a DOI, a link or part of the title')
    .max(300, 'That is too long to look up'),
})

export type LookupCitationInput = z.infer<typeof lookupCitationSchema>
