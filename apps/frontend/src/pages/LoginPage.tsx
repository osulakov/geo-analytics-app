import { useState, type FormEvent } from 'react';
import { observer } from 'mobx-react-lite';
import { Link, useNavigate } from 'react-router-dom';

import { PageShell } from '../components/PageShell';
import { useStores } from '../stores/StoreContext';

/** Login page: same layout as the landing page, with a login form panel. */
export const LoginPage = observer(function LoginPage() {
  const { auth } = useStores();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await auth.login(email, password);
    if (ok) navigate('/');
  };

  return (
    <PageShell showDomains={false} narrow>
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-form__title">Log in</div>

        <label className="auth-form__field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </label>

        <label className="auth-form__field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </label>

        {auth.error && <div className="auth-form__error">{auth.error}</div>}

        <button type="submit" className="auth-form__submit" disabled={auth.loading}>
          {auth.loading ? 'Logging in…' : 'Log in'}
        </button>

        <div className="auth-form__alt">
          No account? <Link to="/signup">Sign up</Link>
        </div>
      </form>
    </PageShell>
  );
});
