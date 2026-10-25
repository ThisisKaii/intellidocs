import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ImportProvider } from './context/ImportContext'
import { ProtectedRoute, AdminRoute, ApprovedProfessorRoute } from './components/ProtectedRoute'
import { ErrorPage } from './components/ErrorPage'
import Home from './pages/Home'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import Document from './pages/Document'
import Settings from './pages/Settings'
import Originality from './pages/Originality'
import AdminDashboard from './pages/AdminDashboard'
import ProfessorDashboard from './pages/ProfessorDashboard'
import AuthCallback from './pages/AuthCallback'
import DriveCallback from './pages/DriveCallback'
import Privacy from './pages/Privacy'
import DevEditorHarness from './pages/DevEditorHarness'
import './App.css'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ImportProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/drive-callback" element={<DriveCallback />} />
          <Route path="/privacy" element={<Privacy />} />
          {import.meta.env.DEV && (
            <Route path="/dev/editor-harness" element={<DevEditorHarness />} />
          )}
          <Route path="/" element={<Landing />} />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            }
          />

          <Route
            path="/document/:id"
            element={
              <ProtectedRoute>
                <Document />
              </ProtectedRoute>
            }
          />

          <Route
            path="/document/:id/originality"
            element={
              <ProtectedRoute>
                <Originality />
              </ProtectedRoute>
            }
          />

          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminDashboard />
              </AdminRoute>
            }
          />

          <Route
            path="/professor"
            element={
              <ApprovedProfessorRoute>
                <ProfessorDashboard />
              </ApprovedProfessorRoute>
            }
          />

          <Route
            path="*"
            element={
              <ErrorPage
                statusCode={404}
                title="404 Page Not Found"
                message="The page you are looking for does not exist or has been moved."
                redirectTo="/"
                redirectLabel="Go to Home"
              />
            }
          />
        </Routes>
        </ImportProvider>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
