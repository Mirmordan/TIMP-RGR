import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { AuthProvider, useAuth } from './auth';
import { ProtectedRoute } from './ProtectedRoute';
import { ErrorBoundary } from './ErrorBoundary';
import { RequireCapability } from './components/RequireCapability';
import { Layout } from './components/Layout/Layout';
import { AuthPage } from './pages/AuthPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { HomePage } from './pages/HomePage';
import { AdminPage } from './pages/AdminPage';
import { ADMIN_ENTRY_CAPS } from './adminAccess';
import { DevicesPage } from './pages/DevicesPage';
import { DeviceDetailPage } from './pages/DeviceDetailPage';
import { DeviceEditPage } from './pages/DeviceEditPage';
import { StreamsPage } from './pages/StreamsPage';
import { StreamDetailPage } from './pages/StreamDetailPage';
import { StreamLivePage } from './pages/StreamLivePage';
import { StreamEditPage } from './pages/StreamEditPage';
import { ProcessesPage } from './pages/ProcessesPage';
import { ProcessDetailPage } from './pages/ProcessDetailPage';
import { ProcessEditPage } from './pages/ProcessEditPage';
import { ProcessCreatePage } from './pages/ProcessCreatePage';
import { ProfilePage } from './pages/ProfilePage';
import { NotificationsProvider } from './notifications';
import { Toaster } from './components/Toaster/Toaster';
import './styles/global.css';

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        Загрузка...
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <AuthPage />} />
      <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
      <Route path="/devices" element={<ProtectedRoute><DevicesPage /></ProtectedRoute>} />
      <Route path="/devices/new" element={<ProtectedRoute><DeviceEditPage /></ProtectedRoute>} />
      <Route path="/devices/:id" element={<ProtectedRoute><DeviceDetailPage /></ProtectedRoute>} />
      <Route path="/devices/:id/edit" element={<ProtectedRoute><DeviceEditPage /></ProtectedRoute>} />
      <Route path="/streams" element={<ProtectedRoute><StreamsPage /></ProtectedRoute>} />
      <Route path="/streams/new" element={<ProtectedRoute><StreamEditPage /></ProtectedRoute>} />
      <Route path="/streams/:id/live" element={<ProtectedRoute><StreamLivePage /></ProtectedRoute>} />
      <Route path="/streams/:id" element={<ProtectedRoute><StreamDetailPage /></ProtectedRoute>} />
      <Route path="/streams/:id/edit" element={<ProtectedRoute><StreamEditPage /></ProtectedRoute>} />
      <Route path="/processes" element={<ProtectedRoute><ProcessesPage /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><RequireCapability caps={ADMIN_ENTRY_CAPS}><AdminPage /></RequireCapability></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/processes/new" element={<ProtectedRoute><ProcessCreatePage /></ProtectedRoute>} />
      <Route path="/processes/:id" element={<ProtectedRoute><ProcessDetailPage /></ProtectedRoute>} />
      <Route path="/processes/:id/edit" element={<ProtectedRoute><ProcessEditPage /></ProtectedRoute>} />
      <Route path="*" element={<Layout><NotFoundPage /></Layout>} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AuthProvider>
          <NotificationsProvider>
            <AppRoutes />
            <Toaster />
          </NotificationsProvider>
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
