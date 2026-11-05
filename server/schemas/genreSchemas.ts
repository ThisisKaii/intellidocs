import { z } from 'zod'

/** The four genres that partition behavior learning (migration 038). */
export const genreSchema = z.enum(['ieee', 'thesis', 'memo', 'general'])

/** Structural signals the editor extracts for genre classification. */
export const genreSignalsSchema = z.object({
  formattingPreset: z.string().max(80).nullable().optional(),
  twoColumn: z.boolean().optional(),
  margins: z
    .object({
      top: z.number().nonnegative().max(10),
      bottom: z.number().nonnegative().max(10),
      left: z.number().nonnegative().max(10),
      right: z.number().nonnegative().max(10),
    })
    .optional(),
  bodyFontPt: z.number().positive().max(200).nullable().optional(),
  lineHeight: z.number().positive().max(10).nullable().optional(),
  headings: z.array(z.string().max(200)).max(200).optional(),
  /** Opening text of the document (first few thousand characters). */
  sample: z.string().max(5000).optional(),
})

/** Body for POST /documents/:id/genre/detect. */
export const detectGenreSchema = z.object({
  signals: genreSignalsSchema,
})

/** Body for PATCH /documents/:id/genre. Null returns the document to auto-detection. */
export const setGenreSchema = z.object({
  genre: genreSchema.nullable(),
})

export type GenreSignalsInput = z.infer<typeof genreSignalsSchema>
