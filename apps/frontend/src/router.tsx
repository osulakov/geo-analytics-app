import { createBrowserRouter } from 'react-router-dom';

import { RootLayout } from './layouts/RootLayout';
import { LandingPage } from './pages/LandingPage';

/**
 * App router. Single route for now, structured so additional pages can be
 * added as children of the root layout later.
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
    ],
  },
]);
