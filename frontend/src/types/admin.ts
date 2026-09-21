export type RoleName = 'student' | 'professor' | 'admin'
export type VerificationStatus = 'pending' | 'approved' | 'rejected'

/** Application metadata attached to a pending verification applicant. */
export interface ApplicantDetails {
  applicantType?: string | null
  college?: string | null
  department?: string | null
  facultyId?: string | null
  institutionalEmail?: string | null
  studentId?: string | null
  degreeProgram?: string | null
  reason?: string | null
  submittedAt?: string | null
}

/** A pending Student or Professor applicant in the admin verification queue. */
export interface AdminApplicant {
  profile_id: string
  user_id: string
  email: string | null
  display_name: string | null
  applied_role: RoleName
  verification_status: VerificationStatus
  applied_at: string
  application_details: ApplicantDetails
}

export interface VerifyApplicantBody {
  status: 'approved' | 'rejected'
  role?: RoleName
  notes?: string
}

/** A user row in the admin directory. */
export interface AdminUserRecord {
  id: string
  user_id: string
  role_id: number
  role_name: RoleName | null
  verification_status: VerificationStatus
  display_name: string | null
  email: string | null
  phone: string | null
  document_count: number
  created_at: string
  updated_at: string
}

/** A document row visible only to admins during moderation. */
export interface AdminDocumentRecord {
  id: string
  title: string
  user_id: string
  email: string | null
  is_deleted: boolean
  revision_count: number
  created_at: string
  updated_at: string
}

/** Platform-wide health metrics for the reports tab. */
export interface SystemReport {
  totalUsers: number
  pendingApplicants: number
  byRole: Record<RoleName, number>
  totalDocuments: number
  activeDocuments: number
  softDeletedDocuments: number
  totalFormattingActions: number
  feedback: {
    total: number
    accepted: number
    rejected: number
    acceptanceRate: string
    byType: Record<string, { total: number; accepted: number; rejected: number; acceptanceRate: string }>
  }
  generatedAt: string
}