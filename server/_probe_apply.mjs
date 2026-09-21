import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const userId = '2792b795-132e-43f5-827b-66b5eee84b4e'

const roleRow = await supabase.from('roles').select('role_id').eq('role_name', 'professor').single()
console.log('roleRow:', JSON.stringify(roleRow))

const upsert = await supabase
  .from('user_profiles')
  .upsert(
    {
      user_id: userId,
      role_id: roleRow.data?.role_id,
      verification_status: 'pending',
      phone: 'FAC-TEST-042',
    },
    { onConflict: 'user_id' }
  )
console.log('upsert error:', upsert.error ? JSON.stringify(upsert.error) : 'NONE')

const notif = await supabase.from('notifications').insert({
  user_id: userId,
  type: 'professor_application',
  title: 'Professor Application Submitted',
  message: 'probe',
  metadata: { college: 'College of Computer Studies', department: 'IT', institutionalEmail: 'faculty@intellidocs.test', facultyId: 'FAC-TEST-042', reason: 'probe', submittedAt: new Date().toISOString() },
})
console.log('notif error:', notif.error ? JSON.stringify(notif.error) : 'NONE')