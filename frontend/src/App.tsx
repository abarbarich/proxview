import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { useAuth } from './store/auth';
import { useLive } from './store/live';
import SetupPage from './pages/SetupPage';
import LoginPage from './pages/LoginPage';
import OverviewPage from './pages/OverviewPage';
import SettingsPage from './pages/SettingsPage';
import NodeDetailPage from './pages/NodeDetailPage';
import PbsDetailPage from './pages/PbsDetailPage';

function Protected({ children }: { children: ReactNode }) {
  const phase = useAuth((s) => s.phase);
  const init = useLive((s) => s.init);

  useEffect(() => {
    if (phase === 'authed') void init();
  }, [phase, init]);

  if (phase === 'loading') {
    return (
      <div className="landing">
        <div className="spinner" aria-label="Loading" />
      </div>
    );
  }
  if (phase === 'needs-setup') return <Navigate to="/setup" replace />;
  if (phase === 'anon') return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}

export default function App() {
  const bootstrap = useAuth((s) => s.bootstrap);
  const phase = useAuth((s) => s.phase);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Close the SSE stream when the session ends.
  useEffect(() => {
    if (phase === 'anon' || phase === 'needs-setup') useLive.getState().teardown();
  }, [phase]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <Protected>
              <OverviewPage />
            </Protected>
          }
        />
        <Route
          path="/settings"
          element={
            <Protected>
              <SettingsPage />
            </Protected>
          }
        />
        <Route
          path="/site/:siteId/node/:node"
          element={
            <Protected>
              <NodeDetailPage />
            </Protected>
          }
        />
        <Route
          path="/pbs/:siteId"
          element={
            <Protected>
              <PbsDetailPage />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
