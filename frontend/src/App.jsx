import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/AdminDashboard';
import TeacherDashboard from './pages/TeacherDashboard';
import TeacherSubjectDetail from './pages/TeacherSubjectDetail';
import StudentDashboard from './pages/StudentDashboard';
import StudentSubjectDetail from './pages/StudentSubjectDetail';

function Unauthorized() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh', gap: '1rem', textAlign: 'center',
    }}>
      <div style={{ fontSize: '4rem' }}>🚫</div>
      <h2>Access Denied</h2>
      <p style={{ color: 'var(--text-secondary)' }}>You don't have permission to view this page.</p>
      <a href="/" style={{ color: 'var(--accent-light)' }}>Go back to login</a>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#0f1623',
              color: '#f0f4ff',
              border: '1px solid rgba(99,102,241,0.25)',
              borderRadius: '10px',
            },
          }}
        />
        <Routes>
          {/* Public */}
          <Route path="/" element={<LoginPage />} />
          <Route path="/unauthorized" element={<Unauthorized />} />

          {/* Admin */}
          <Route path="/admin" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          } />

          {/* Teacher */}
          <Route path="/teacher" element={
            <ProtectedRoute allowedRoles={['teacher']}>
              <TeacherDashboard />
            </ProtectedRoute>
          } />
          <Route path="/teacher/subject/:subjectId" element={
            <ProtectedRoute allowedRoles={['teacher']}>
              <TeacherSubjectDetail />
            </ProtectedRoute>
          } />

          {/* Student */}
          <Route path="/student" element={
            <ProtectedRoute allowedRoles={['student']}>
              <StudentDashboard />
            </ProtectedRoute>
          } />
          <Route path="/student/subject/:subjectId" element={
            <ProtectedRoute allowedRoles={['student']}>
              <StudentSubjectDetail />
            </ProtectedRoute>
          } />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
