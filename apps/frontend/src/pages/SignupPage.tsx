import { useState, type FormEvent } from 'react';
import { observer } from 'mobx-react-lite';
import { Link, useNavigate } from 'react-router-dom';

import { PageShell } from '../components/PageShell';
import { useStores } from '../stores/StoreContext';

/** Signup page: same layout as the landing page, with a create-account panel. */
export const SignupPage = observer(function SignupPage() {
  const { auth } = useStores();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);

  // Client-side confirm-password validation (the backend still enforces the
  // email format and minimum length).
  const confirmError =
    confirm.length === 0
      ? 'Please confirm your password'
      : password !== confirm
        ? 'Passwords do not match'
        : null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (confirmError) return;
    const ok = await auth.signup(email, password);
    if (ok) navigate('/');
  };

  return (
    <PageShell showDomains={false} narrow>
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-form__title">Create account</div>

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
            placeholder="At least 6 characters"
            autoComplete="new-password"
            minLength={6}
            required
          />
        </label>

        <label className="auth-form__field">
          <span>Confirm password</span>
          <input
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="Re-enter your password"
            autoComplete="new-password"
            required
          />
        </label>

        {touched && confirmError && <div className="auth-form__error">{confirmError}</div>}
        {auth.error && <div className="auth-form__error">{auth.error}</div>}

        <button
          type="submit"
          className="auth-form__submit"
          disabled={auth.loading || (touched && confirmError !== null)}
        >
          {auth.loading ? 'Creating…' : 'Sign up'}
        </button>

        <div className="auth-form__alt">
          Already have an account? <Link to="/login">Log in</Link>
        </div>
      </form>
    </PageShell>
  );
});
