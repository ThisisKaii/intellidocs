import { type z } from 'zod'
import { structureUserSectionSchema } from '../../../schemas/mcpSchemas'
import { orchestrateSectionDraft, type SectionDraftResult } from '../../skills/orchestrateSectionDraft'

/** Organise the user's own notes into a formal section; a preview the editor inserts only on confirmation. */
export async function structureUserSection(args: z.infer<typeof structureUserSectionSchema>): Promise<SectionDraftResult> {
  return orchestrateSectionDraft({ sectionTitle: args.sectionTitle, userNotes: args.userNotes, genre: args.genre })
}
