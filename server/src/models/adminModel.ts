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

/** Generate a structured empirical research CSV dataset for Chapter 4 analysis. */
export async function generateEmpiricalDataset(): Promise<string> {
  // Fetch prediction feedback records
  const { data: feedbackData, error: fbErr } = await supabase
    .from('prediction_feedback')
    .select('user_id, document_id, prediction_type, predicted_format, confidence, accepted, created_at')
    .order('created_at', { ascending: true })

  if (fbErr) {
    console.error('Error fetching prediction feedback:', fbErr)
    throw new Error(fbErr.message)
  }

  // Fetch formatting action counts
  const { count: totalActions } = await supabase
    .from('formatting_actions')
    .select('*', { count: 'exact', head: true })

  const { count: totalUsers } = await supabase
    .from('user_profiles')
    .select('*', { count: 'exact', head: true })

  const { count: totalDocs } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true })

  // Build CSV rows
  const rows: string[] = []

  // Header
  rows.push('metric,value,description')

  // Summary metrics
  rows.push(`total_users,${totalUsers || 0},Total registered users in platform`)
  rows.push(`total_documents,${totalDocs || 0},Total documents created`)
  rows.push(`total_formatting_actions,${totalActions || 0},Total formatting actions logged`)
  rows.push(`total_predictions,${feedbackData?.length || 0},Total ML predictions with feedback`)
  rows.push(`generated_at,"${new Date().toISOString()}",Dataset generation timestamp`)

  // Per-prediction records (for confusion matrix and acceptance rate)
  if (feedbackData && feedbackData.length > 0) {
    rows.push('')
    rows.push('---PREDICTION_FEEDBACK---')
    rows.push('user_id,document_id,prediction_type,predicted_format,confidence,accepted,created_at')

    for (const fb of feedbackData) {
      rows.push(
        `"${fb.user_id}","${fb.document_id || ''}","${fb.prediction_type}","${fb.predicted_format}",${fb.confidence ?? ''},${fb.accepted},"${fb.created_at}"`
      )
    }

    // Compute acceptance rates by prediction type
    const byType: Record<string, { total: number; accepted: number }> = {}
    for (const fb of feedbackData) {
      const key = fb.prediction_type
      if (!byType[key]) byType[key] = { total: 0, accepted: 0 }
      byType[key].total++
      if (fb.accepted) byType[key].accepted++
    }

    rows.push('')
    rows.push('---ACCEPTANCE_BY_TYPE---')
    rows.push('prediction_type,total_predictions,accepted,acceptance_rate')
    for (const [type, stats] of Object.entries(byType)) {
      const rate = stats.total > 0 ? (stats.accepted / stats.total * 100).toFixed(2) : '0.00'
      rows.push(`"${type}",${stats.total},${stats.accepted},${rate}%`)
    }

    // Personalization curve: acceptance rate over time (bucketed by week)
    const weeklyMap: Record<string, { total: number; accepted: number }> = {}
    for (const fb of feedbackData) {
      const d = new Date(fb.created_at)
      const weekKey = `${d.getFullYear()}-W${String(Math.ceil((d.getDate()) / 7)).padStart(2, '0')}`
      if (!weeklyMap[weekKey]) weeklyMap[weekKey] = { total: 0, accepted: 0 }
      weeklyMap[weekKey].total++
      if (fb.accepted) weeklyMap[weekKey].accepted++
    }

    rows.push('')
    rows.push('---PERSONALIZATION_CURVE---')
    rows.push('week,total_predictions,accepted,acceptance_rate')
    for (const [week, stats] of Object.entries(weeklyMap)) {
      const rate = stats.total > 0 ? (stats.accepted / stats.total * 100).toFixed(2) : '0.00'
      rows.push(`"${week}",${stats.total},${stats.accepted},${rate}%`)
    }

    // Format distribution
    const formatCounts: Record<string, number> = {}
    for (const fb of feedbackData) {
      formatCounts[fb.predicted_format] = (formatCounts[fb.predicted_format] || 0) + 1
    }

    rows.push('')
    rows.push('---FORMAT_DISTRIBUTION---')
    rows.push('predicted_format,count,percentage')
    const totalPreds = feedbackData.length
    for (const [fmt, count] of Object.entries(formatCounts).sort((a, b) => b[1] - a[1])) {
      const pct = (count / totalPreds * 100).toFixed(2)
      rows.push(`"${fmt}",${count},${pct}%`)
    }
  }

  return rows.join('\n')
}
