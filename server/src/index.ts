import dotenv from 'dotenv'

dotenv.config()

import express from 'express'
import cors from 'cors'
import documentRoutes from './routes/documentRoutes'
import authRoutes from './routes/authRoutes'
import behaviorRoutes from './routes/behaviorRoutes'
import predictionRoutes from './routes/predictionRoutes'
import aiRoutes from './routes/aiRoutes'
import folderRoutes from './routes/folderRoutes'
import driveRoutes from './routes/driveRoutes'
import professorRoutes from './routes/professorRoutes'
import notificationRoutes from './routes/notificationRoutes'
import adminRoutes from './routes/adminRoutes'
import mcpRouter from './mcp/mcpServer'
import { authMiddleware } from './middleware/authMiddleware'

const app = express()
const PORT = process.env.PORT || 3000

app.set('trust proxy', true)

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}))
app.use(express.json({ limit: '100mb' }))
app.use(express.urlencoded({ limit: '100mb', extended: true }))

// Health check route
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'IntelliDocs API is running',
    timestamp: new Date().toISOString()
  })
})

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to IntelliDocs API',
    version: '0.2.0'
  })
})

// System routes
app.use('/documents', authMiddleware, documentRoutes)
app.use('/auth', authRoutes)
app.use('/behavior', authMiddleware, behaviorRoutes)
app.use('/predictions', authMiddleware, predictionRoutes)
app.use('/ai', authMiddleware, aiRoutes)
app.use('/folders', authMiddleware, folderRoutes)
app.use('/drive', authMiddleware, driveRoutes)
app.use('/professor', authMiddleware, professorRoutes)
app.use('/notifications', authMiddleware, notificationRoutes)
app.use('/admin', adminRoutes)
app.use('/mcp', authMiddleware, mcpRouter)

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' })
})

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Internal server error' })
})

// Start server
app.listen(PORT as number, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`)
  console.log(`📊 Health check: http://0.0.0.0:${PORT}/health`)
})

export default app
