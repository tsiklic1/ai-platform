import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { BrandProvider } from './context/BrandContext'
import { DashboardLayout } from './layouts/DashboardLayout'
import Login from './pages/Login'
import Skills from './pages/Skills'
import Tasks from './pages/Tasks'
import Identity from './pages/Identity'
import Images from './pages/Images'
import Captions from './pages/Captions'
import Frames from './pages/Frames'
import Videos from './pages/Videos'
import ContentTypes from './pages/ContentTypes'
import Brands from './pages/Brands'
import BrandCreate from './pages/BrandCreate'

function ProtectedRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return (
    <Routes>
      <Route element={<DashboardLayout />}>
        <Route path="/" element={<Navigate to="/skills" replace />} />
        <Route path="/skills" element={<Skills />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/contentTypes" element={<ContentTypes />} />
        <Route path="/identity" element={<Identity />} />
        <Route path="/brands" element={<Brands />} />
        <Route path="/brands/new" element={<BrandCreate />} />
        <Route path="/images" element={<Images />} />
        <Route path="/captions" element={<Captions />} />
        <Route path="/frames" element={<Frames />} />
        <Route path="/videos" element={<Videos />} />
      </Route>
    </Routes>
  )
}

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/*" element={<ProtectedRoutes />} />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <BrandProvider>
          <AppRoutes />
        </BrandProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
