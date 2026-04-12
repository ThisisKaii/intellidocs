import dotenv from 'dotenv'

dotenv.config()


import express from 'express'
import cors from 'cors'
import documentRoutes from './routes/documentRoutes'
import authRoutes from './routes/authRoutes'
import { authMiddleware } from './middleware/authMiddleware'



const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

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
    version: '0.1.0'
  })
})

app.use('/documents',authMiddleware,  documentRoutes)
app.use('/auth', authRoutes)

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' })
})

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Internal server error' })
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`)
  console.log(`📊 Health check: http://localhost:${PORT}/health`)
})

export default app
