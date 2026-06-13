import { createBrowserRouter } from 'react-router-dom';

import { RootLayout } from './layouts/RootLayout';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { ExplorePage } from './pages/ExplorePage';

/**
 * App router. `/` is the workspace chooser landing page; `/explore` is the
 * Maritime analytics globe.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: <LandingPage />,
      },
      {
        path: 'login',
        element: <LoginPage />,
      },
      {
        path: 'signup',
        element: <SignupPage />,
      },
      {
        path: 'explore',
        element: <ExplorePage />,
      },
    ],
  },
]);
