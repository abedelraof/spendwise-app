import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/auth/ProtectedRoute';
import PublicHome from './components/auth/PublicHome';
import AppShell from './components/layout/AppShell';
import Toast from './components/common/Toast';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Recurring from './pages/Recurring';
import Accounts from './pages/Accounts';
import Income from './pages/Income';

export default function App() {
  return (
    <BrowserRouter>
      <Toast />
      <Routes>
        <Route path="/" element={<PublicHome />} />
        <Route path="/app/login" element={<Login />} />
        <Route path="/app/signup" element={<Signup />} />
        <Route path="/app" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="reports" element={<Reports />} />
          <Route path="recurring" element={<Recurring />} />
          <Route path="accounts" element={<Accounts />} />
          <Route path="income" element={<Income />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
