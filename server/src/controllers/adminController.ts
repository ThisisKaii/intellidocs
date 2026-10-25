import { Response } from 'express'
import { AuthenticatedRequest } from '../types/express'
import * as adminModel from '../models/adminModel'
import { VerifyApplicantBody } from '../../schemas/adminSchemas'

export async function getPendingApplicants(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const list = await adminModel.getPendingApplicants()
    res.json(list)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch pending applicants'
    res.status(500).json({ error: message })
  }
}

/** Approve or reject a pending Student/Professor applicant, granting the requested role on approval. */
export async function verifyApplicant(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const targetUserId = req.params.userId
    const payload = req.body as VerifyApplicantBody

    if (!targetUserId) {
      res.status(400).json({ error: 'Missing userId' })
      return
    }

    const result = await adminModel.verifyApplicant(targetUserId, payload.status, payload.role, payload.notes, req.user?.id)
    res.json({
      message: `Application ${payload.status} successfully`,
      newRole: payload.role ?? null,
      profile: result,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update verification status'
    res.status(500).json({ error: message })
  }
}

/** List documents across all users for moderation (bypasses user isolation). */
export async function getAllDocuments(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q : undefined
    const docs = await adminModel.getAllDocumentsForAdmin(query)
    res.json(docs)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch documents'
    res.status(500).json({ error: message })
  }
}

export async function getAllUsers(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const users = await adminModel.getAllUsers()
    res.json(users)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch users'
    res.status(500).json({ error: message })
  }
}

export async function updateUserRole(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const targetUserId = req.params.userId
    const { roleId } = req.body

    if (!targetUserId || !roleId) {
      res.status(400).json({ error: 'Missing userId or roleId' })
      return
    }

    const updated = await adminModel.updateUserRole(targetUserId, roleId)
    res.json(updated)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update user role'
    res.status(500).json({ error: message })
  }
}

export async function getSystemReports(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const reports = await adminModel.getSystemReports()
    res.json(reports)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate system reports'
    res.status(500).json({ error: message })
  }
}

export async function deleteDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const documentId = req.params.documentId
    if (!documentId) {
      res.status(400).json({ error: 'Missing documentId' })
      return
    }

    await adminModel.deleteDocumentByAdmin(documentId)
    res.json({ message: 'Document deleted by admin' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete document'
    res.status(500).json({ error: message })
  }
}

/** Export empirical research dataset as CSV for Chapter 4 analysis. */
export async function exportEmpiricalData(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const csvData = await adminModel.generateEmpiricalDataset()
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="intellidocs_research_dataset_${new Date().toISOString().slice(0, 10)}.csv"`)
    res.status(200).send(csvData)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to export empirical data'
    res.status(500).json({ error: message })
  }
}

/** Weekly activity series for the admin charts; `weeks` is clamped to 4-52. */
export async function getReportTimeseries(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const requested = Number(req.query.weeks)
    const weeks = Number.isFinite(requested) ? Math.min(52, Math.max(4, Math.round(requested))) : 12
    res.json(await adminModel.getReportTimeseries(weeks))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build report series'
    res.status(500).json({ error: message })
  }
}
