import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Wallet, Sparkles, TrendingDown, ShieldCheck } from 'lucide-react';
import { signup } from '../api/authApi';
import useAuth from '../hooks/useAuth';
import { showToast } from '../components/common/Toast';

const features = [
  { icon: Sparkles,    text: 'AI-powered expense parsing from natural language' },
  { icon: TrendingDown, text: 'Smart insights and spending trends' },
  { icon: ShieldCheck, text: 'Your data stays private and secure' },
];

export default function Signup() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const { login } = useAuth();
  const navigate  = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    if (password.length < 8) return showToast('Password must be at least 8 characters', 'error');
    setLoading(true);
    try {
      const { token, user } = await signup(email, password);
      login(token, user);
      navigate('/app/settings');
      showToast('Account created! Add your Claude API key in Settings to get started.');
    } catch (err) {
      showToast(err.response?.data?.error || 'Signup failed', 'error');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] bg-brand-gradient p-12">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
            <Wallet size={18} className="text-white" />
          </div>
          <span className="text-white font-bold text-xl tracking-tight">SpendWise</span>
        </div>

        <div className="space-y-8">
          <div>
            <h2 className="text-3xl font-bold text-white leading-tight">Your finances,<br />finally under control.</h2>
            <p className="text-brand-200 mt-3 text-sm leading-relaxed">
              Set up in under 2 minutes. No spreadsheets needed.
            </p>
          </div>
          <div className="space-y-4">
            {features.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white/15 rounded-lg flex items-center justify-center shrink-0">
                  <Icon size={14} className="text-white" />
                </div>
                <span className="text-sm text-brand-100">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-brand-300 text-xs">© 2025 SpendWise</p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 bg-gray-50 dark:bg-slate-950">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Create your account</h1>
            <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">Start tracking expenses with AI</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} required autoFocus placeholder="you@example.com" />
            </div>
            <div>
              <label className="label">Password</label>
              <input type="password" className="input" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} placeholder="Min 8 characters" />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 mt-2">
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
          <p className="text-center text-sm text-gray-500 dark:text-slate-400 mt-5">
            Already have an account?{' '}
            <Link to="/app/login" className="font-medium text-brand-600 dark:text-brand-400 hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
