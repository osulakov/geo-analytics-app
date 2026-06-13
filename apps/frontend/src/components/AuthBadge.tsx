import { observer } from 'mobx-react-lite';
import { useNavigate } from 'react-router-dom';

import { useStores } from '../stores/StoreContext';

/**
 * Top-right identity control. When signed in, shows "Welcome, {email}" with a
 * log-out action; otherwise a Log in button that routes to /login.
 */
export const AuthBadge = observer(function AuthBadge() {
  const { auth } = useStores();
  const navigate = useNavigate();

  if (auth.isAuthenticated) {
    return (
      <div className="auth-badge">
        <span className="auth-badge__welcome">Welcome, {auth.email}</span>
        <button type="button" className="auth-badge__logout" onClick={() => auth.logout()}>
          Log out
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="auth-badge auth-badge--login"
      onClick={() => navigate('/login')}
    >
      Log in
    </button>
  );
});
