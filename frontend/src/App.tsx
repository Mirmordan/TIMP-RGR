import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { AuthProvider, useAuth } from './auth';
import { ProtectedRoute } from './ProtectedRoute';
import { RequireCapability } from './components/RequireCapability';
import { AuthPage } from './pages/AuthPage';
import { HomePage } from './pages/HomePage';
import { AdminPage } from './pages/AdminPage';
import { DevicesPage } from './pages/DevicesPage';
import { DeviceDetailPage } from './pages/DeviceDetailPage';
import { DeviceEditPage } from './pages/DeviceEditPage';
import { StreamsPage } from './pages/StreamsPage';
import { StreamDetailPage } from './pages/StreamDetailPage';
import { StreamEditPage } from './pages/StreamEditPage';
import { ProcessesPage } from './pages/ProcessesPage';
import { ProcessDetailPage } from './pages/ProcessDetailPage';
import { ProcessEditPage } from './pages/ProcessEditPage';
import { ProcessCreatePage } from './pages/ProcessCreatePage';
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
      <Route path="/devices/:id" element={<ProtectedRoute><DeviceDetailPage /></ProtectedRoute>} />
      <Route path="/devices/:id/edit" element={<ProtectedRoute><DeviceEditPage /></ProtectedRoute>} />
      <Route path="/streams" element={<ProtectedRoute><StreamsPage /></ProtectedRoute>} />
      <Route path="/streams/:id" element={<ProtectedRoute><StreamDetailPage /></ProtectedRoute>} />
      <Route path="/streams/:id/edit" element={<ProtectedRoute><StreamEditPage /></ProtectedRoute>} />
      <Route path="/processes" element={<ProtectedRoute><ProcessesPage /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><RequireCapability caps={['admin:read']}><AdminPage /></RequireCapability></ProtectedRoute>} />
      <Route path="/processes/new" element={<ProtectedRoute><ProcessCreatePage /></ProtectedRoute>} />
      <Route path="/processes/:id" element={<ProtectedRoute><ProcessDetailPage /></ProtectedRoute>} />
      <Route path="/processes/:id/edit" element={<ProtectedRoute><ProcessEditPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
