import { observer } from 'mobx-react-lite';
import { useNavigate } from 'react-router-dom';

import { useStores } from '../stores/StoreContext';

/**
 * Inline identity line for the explore page's top-right stack. Shows
 * "Welcome, {email}" with a log-out action when signed in, otherwise a Log in
 * link. Unlike AuthBadge it flows in the layout instead of being fixed.
 */
export const WelcomeBadge = observer(function WelcomeBadge() {
  const { auth } = useStores();
  const navigate = useNavigate();

  if (auth.isAuthenticated) {
    return (
      <div className="welcome-badge">
        <span className="welcome-badge__text">Welcome, {auth.email}</span>
        <button type="button" className="welcome-badge__logout" onClick={() => auth.logout()}>
          Log out
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="welcome-badge welcome-badge__login"
      onClick={() => navigate('/login')}
    >
      Log in
    </button>
  );
});
