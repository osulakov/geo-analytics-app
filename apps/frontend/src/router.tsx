import { createBrowserRouter } from 'react-router-dom';

import { RootLayout } from './layouts/RootLayout';
import { LandingPage } from './pages/LandingPage';
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
        path: 'explore',
        element: <ExplorePage />,
      },
    ],
  },
]);
