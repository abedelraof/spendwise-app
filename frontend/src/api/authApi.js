import axios from 'axios';
const base = import.meta.env.VITE_API_BASE_URL;

export const signup = (email, password) =>
  axios.post(`${base}/auth/signup`, { email, password }).then(r => r.data);

export const login = (email, password) =>
  axios.post(`${base}/auth/login`, { email, password }).then(r => r.data);
