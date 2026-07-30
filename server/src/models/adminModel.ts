import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

/** Fetch all users who applied as Professor and have verification_status = 'pending'. */
export async function getPendingProfessorApplicants(): Promise<any[]> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select(`
      id,
      user_id,
      display_name,
      verification_status,
      created_at,
      roles!inner(role_name)
    `)
    .eq('roles.role_name', 'professor')
    .eq('verification_status', 'pending')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching pending professors:', error)
    throw new Error(error.message)
  }

  // Join auth email if available
  return (data || []).map((p: any) => ({
    profile_id: p.id,
    user_id: p.user_id,
    display_name: p.display_name,
    role_name: p.roles?.role_name,
    verification_status: p.verification_status,
    applied_at: p.created_at,
  }))
}

/** Approve or reject a professor applicant, updating verification_status and creating an in-app notification. */
export async function verifyProfessorApplicant(
  userId: string,
  status: 'approved' | 'rejected',
  notes?: string
): Promise<any> {
  const { data: updatedProfile, error: updateErr } = await supabase
    .from('user_profiles')
    .update({
      verification_status: status,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .select()
    .single()

  if (updateErr) {
    console.error('Error updating professor status:', updateErr)
    throw new Error(updateErr.message)
  }

  // Send in-app notification to the applicant
  const title = status === 'approved' ? 'Professor Application Approved!' : 'Professor Application Update'
  const message = status === 'approved'
    ? 'Congratulations! Your professor application has been approved by the Administrator. You now have access to review and grading features.'
    : `Your professor application has been reviewed. Status: Rejected. ${notes ? `Notes: ${notes}` : ''}`

  await supabase.from('notifications').insert({
    user_id: userId,
    type: 'professor_verification',
    title,
    message,
    metadata: { status, notes: notes || null },
  })

  return updatedProfile
}

/** Fetch all registered users with their assigned roles and verification status. */
export async function getAllUsers(): Promise<any[]> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select(`
      id,
      user_id,
      role_id,
      verification_status,
      display_name,
      phone,
      created_at,
      updated_at,
      roles(role_name)
    `)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching all users:', error)
    throw new Error(error.message)
  }

  return data || []
}

/** Update a user's role_id. */
export async function updateUserRole(userId: string, roleId: number): Promise<any> {
  const { data, error } = await supabase
    .from('user_profiles')
    .update({
      role_id: roleId,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    console.error('Error updating user role:', error)
    throw new Error(error.message)
  }

  return data
}

/** Fetch platform-wide aggregated system statistics for admin reports. */
export async function getSystemReports(): Promise<any> {
  const [
    { count: totalUsers },
    { count: totalDocuments },
    { count: pendingProfessors },
    { count: totalActions },
  ] = await Promise.all([
    supabase.from('user_profiles').select('*', { count: 'exact', head: true }),
    supabase.from('documents').select('*', { count: 'exact', head: true }),
    supabase.from('user_profiles').select('*', { count: 'exact', head: true }).eq('verification_status', 'pending'),
    supabase.from('formatting_actions').select('*', { count: 'exact', head: true }),
  ])

  return {
    totalUsers: totalUsers || 0,
    totalDocuments: totalDocuments || 0,
    pendingProfessors: pendingProfessors || 0,
    totalFormattingActions: totalActions || 0,
    generatedAt: new Date().toISOString(),
  }
}

/** Delete any document as an Admin moderator. */
export async function deleteDocumentByAdmin(documentId: string): Promise<boolean> {
  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', documentId)

  if (error) {
    console.error('Error deleting document as admin:', error)
    throw new Error(error.message)
  }

  return true
}
