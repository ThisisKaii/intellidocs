import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = {}
for (const line of readFileSync(process.argv[2], 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const url = env.SUPABASE_URL
const key = env.SUPABASE_SERVICE_KEY
console.log('url  :', url)
console.log('key  : role claim =', JSON.parse(Buffer.from(key.split('.')[1], 'base64url')).role)

const supabase = createClient(url, key)

// Probe 1: can this key READ user_profiles? service_role bypasses RLS, so a
// bypass that works here should return rows rather than an empty set.
const { data: rows, error: readErr } = await supabase
  .from('user_profiles')
  .select('user_id, role_id, verification_status')
  .limit(3)
console.log('\n[read user_profiles]')
console.log('  error  :', readErr ? readErr.message : 'none')
console.log('  rows   :', rows ? rows.length : 'null')

// Probe 2: same read with the ANON key, for contrast.
const anonKey = env.SUPABASE_ANON_KEY
if (anonKey) {
  const anon = createClient(url, anonKey)
  const { data: anonRows, error: anonErr } = await anon.from('user_profiles').select('user_id').limit(3)
  console.log('\n[read user_profiles with anon key]')
  console.log('  error  :', anonErr ? anonErr.message : 'none')
  console.log('  rows   :', anonRows ? anonRows.length : 'null')
}

// Probe 3: is the professor role present? applyProfessor 500s early without it.
const { data: role, error: roleErr } = await supabase
  .from('roles')
  .select('role_id, role_name')
  .eq('role_name', 'professor')
  .single()
console.log('\n[roles: professor]')
console.log('  error  :', roleErr ? roleErr.message : 'none')
console.log('  role_id:', role?.role_id ?? 'null')
