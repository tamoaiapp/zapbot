import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Toaster } from './components/Toaster';
import { useSystemEvents } from './hooks/useSystemEvents';
import { useAppStore } from './store/app-store';
import { Onboarding } from './pages/Onboarding';
import { Inbox } from './pages/Inbox';
import { Config } from './pages/Config';
import { Scheduler } from './pages/Scheduler';
import { Settings } from './pages/Settings';

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full flex">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-hidden">{children}</main>
      <Toaster />
    </div>
  );
}

function NeedsOnboarding() {
  const status = useAppStore((s) => s.status);
  if (!status) return false;
  if (status.whatsapp !== 'open') return true;
  if (!status.model_installed) return true;
  return false;
}

export default function App() {
  useSystemEvents();
  const status = useAppStore((s) => s.status);
  const navigate = useNavigate();
  const needsOnboarding = NeedsOnboarding();

  // Auto-redirect to onboarding when WA not connected / model missing
  useEffect(() => {
    if (status && needsOnboarding) {
      navigate('/onboarding', { replace: true });
    }
  }, [status, needsOnboarding, navigate]);

  if (!status) {
    return (
      <div className="h-full flex items-center justify-center bg-wa-panel">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-wa-green mx-auto" />
          <p className="text-slate-600 mt-4 text-sm">Iniciando ZapBot…</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/onboarding" element={<Onboarding />} />
      <Route
        path="/inbox"
        element={
          <Layout>
            <Inbox />
          </Layout>
        }
      />
      <Route
        path="/config"
        element={
          <Layout>
            <Config />
          </Layout>
        }
      />
      <Route
        path="/scheduler"
        element={
          <Layout>
            <Scheduler />
          </Layout>
        }
      />
      <Route
        path="/settings"
        element={
          <Layout>
            <Settings />
          </Layout>
        }
      />
      <Route path="*" element={<Navigate to="/onboarding" replace />} />
    </Routes>
  );
}
