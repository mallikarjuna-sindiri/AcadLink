import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/AdminDashboard';
import TeacherDashboard from './pages/TeacherDashboard';
import TeacherHolidaysPage from './pages/TeacherHolidaysPage';
import TeacherSubjectDetail from './pages/TeacherSubjectDetail';
import StudentDashboard from './pages/StudentDashboard';
import StudentSubjectDetail from './pages/StudentSubjectDetail';
import NotificationsPage from './pages/NotificationsPage';
import StudentCalendarPage from './pages/StudentCalendarPage';

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

function AppRoutes() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const toastStyle = isDark
    ? { background: '#0f1623', color: '#f0f4ff', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '10px' }
    : { background: '#ffffff', color: '#0f1623', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '10px', boxShadow: '0 4px 20px rgba(99,102,241,0.1)' };

  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{ style: toastStyle }}
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
          <Route path="/admin/notifications" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <NotificationsPage />
            </ProtectedRoute>
          } />

          {/* Teacher */}
          <Route path="/teacher" element={
            <ProtectedRoute allowedRoles={['teacher']}>
              <TeacherDashboard />
            </ProtectedRoute>
          } />
          <Route path="/teacher/holidays" element={
            <ProtectedRoute allowedRoles={['teacher']}>
              <TeacherHolidaysPage />
            </ProtectedRoute>
          } />
          <Route path="/teacher/notifications" element={
            <ProtectedRoute allowedRoles={['teacher']}>
              <NotificationsPage />
            </ProtectedRoute>
          } />
          <Route path="/teacher/subject/:subjectId" element={
            <ProtectedRoute allowedRoles={['teacher']}>
              <TeacherSubjectDetail />
            </ProtectedRoute>
          } />
          <Route path="/teacher/calendar" element={
            <ProtectedRoute allowedRoles={['teacher']}>
              <StudentCalendarPage />
            </ProtectedRoute>
          } />

          {/* Student */}
          <Route path="/student" element={
            <ProtectedRoute allowedRoles={['student']}>
              <StudentDashboard />
            </ProtectedRoute>
          } />
          <Route path="/student/notifications" element={
            <ProtectedRoute allowedRoles={['student']}>
              <NotificationsPage />
            </ProtectedRoute>
          } />
          <Route path="/student/calendar" element={
            <ProtectedRoute allowedRoles={['student']}>
              <StudentCalendarPage />
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

export default function App() {
  return (
    <ThemeProvider>
      <AppRoutes />
    </ThemeProvider>
  );
}
