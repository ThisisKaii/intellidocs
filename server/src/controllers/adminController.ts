import { Response } from 'express'
import { AuthenticatedRequest } from '../types/express'
import * as adminModel from '../models/adminModel'

export async function getPendingProfessors(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const list = await adminModel.getPendingProfessorApplicants()
    res.json(list)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch pending professor applications'
    res.status(500).json({ error: message })
  }
}

export async function verifyProfessor(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const targetUserId = req.params.userId
    const { status, notes } = req.body

    if (!targetUserId || !['approved', 'rejected'].includes(status)) {
      res.status(400).json({ error: 'Invalid payload. status must be "approved" or "rejected"' })
      return
    }

    const result = await adminModel.verifyProfessorApplicant(targetUserId, status, notes)
    res.json({ message: `Professor application ${status} successfully`, profile: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update professor verification status'
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
