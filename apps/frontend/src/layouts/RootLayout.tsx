import { Outlet } from 'react-router-dom';

/**
 * Top-level layout shared by every route. Currently just renders the active
 * route; navigation/chrome can be added here later.
 */
export function RootLayout() {
  return (
    <div style={{ height: '100%', width: '100%' }}>
      <Outlet />
    </div>
  );
}
