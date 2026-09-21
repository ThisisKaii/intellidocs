import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

export type PersonalizationSettingKey = 'custom_dictionary' | 'ignored_patterns'

/** Read a string-list personalization setting (e.g. custom dictionary). */
export async function getStringListSetting(
  userId: string,
  key: PersonalizationSettingKey
): Promise<string[]> {
  const { data, error } = await supabase
    .from('personalization_settings')
    .select('value')
    .eq('user_id', userId)
    .eq('key', key)
    .maybeSingle()

  if (error) throw new Error(`Failed to read personalization settings: ${error.message}`)

  const value = data?.value
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

/** Write (upsert) a string-list personalization setting for a user. */
export async function setStringListSetting(
  userId: string,
  key: PersonalizationSettingKey,
  value: string[]
): Promise<void> {
  const { error } = await supabase
    .from('personalization_settings')
    .upsert({ user_id: userId, key, value }, { onConflict: 'user_id,key' })

  if (error) throw new Error(`Failed to write personalization settings: ${error.message}`)
}