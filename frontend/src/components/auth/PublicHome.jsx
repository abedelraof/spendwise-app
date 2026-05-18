import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';

export default function PublicHome() {
  const { token } = useAuth();

  useEffect(() => {
    if (!token) {
      window.location.replace('/landing.html');
    }
  }, [token]);

  if (token) return <Navigate to="/app" replace />;
  return null;
}
