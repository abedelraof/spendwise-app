import axios from 'axios';
import { useContext, useMemo } from 'react';
import { AuthContext } from '../context/AuthContext';

export default function useApi() {
  const { token } = useContext(AuthContext);
  return useMemo(() => {
    const instance = axios.create({
      baseURL: import.meta.env.VITE_API_BASE_URL,
    });
    instance.interceptors.request.use(cfg => {
      if (token) cfg.headers.Authorization = `Bearer ${token}`;
      return cfg;
    });
    return instance;
  }, [token]);
}
