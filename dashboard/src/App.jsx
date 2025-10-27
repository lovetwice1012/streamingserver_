import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Recordings from './pages/Recordings';
import Quota from './pages/Quota';
import Plans from './pages/Plans';
import Settings from './pages/Settings';
import Streaming from './pages/Streaming';
import AdminUsers from './pages/admin/Users';
import AdminSessions from './pages/admin/Sessions';
import AdminRecordings from './pages/admin/Recordings';
import AdminStats from './pages/admin/Stats';
import AdminPlanManagement from './pages/admin/PlanManagement';
import Layout from './components/Layout';

function PrivateRoute({ children }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  return isAuthenticated ? children : <Navigate to="/login" />;
}

function AdminRoute({ children }) {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  
  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }
  
  if (user?.role !== 'admin') {
    return <Navigate to="/dashboard" />;
  }
  
  return children;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Navigate to="/dashboard" />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="streaming" element={<Streaming />} />
        <Route path="recordings" element={<Recordings />} />
        <Route path="quota" element={<Quota />} />
        <Route path="plans" element={<Plans />} />
        <Route path="settings" element={<Settings />} />
        
        {/* Admin Routes */}
        <Route path="admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
        <Route path="admin/sessions" element={<AdminRoute><AdminSessions /></AdminRoute>} />
        <Route path="admin/recordings" element={<AdminRoute><AdminRecordings /></AdminRoute>} />
        <Route path="admin/stats" element={<AdminRoute><AdminStats /></AdminRoute>} />
        <Route path="admin/plans" element={<AdminRoute><AdminPlanManagement /></AdminRoute>} />
      </Route>
    </Routes>
  );
}

export default App;
