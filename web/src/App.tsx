import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastProvider } from './components/ui';
import { AdminPage } from './pages/AdminPage';
import { EventListPage } from './pages/EventListPage';
import { NewEventPage } from './pages/NewEventPage';
import { ProfilePage } from './pages/ProfilePage';
import { SchedulePage } from './pages/SchedulePage';

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<EventListPage />} />
          <Route path="/new" element={<NewEventPage />} />
          <Route path="/e/:slug" element={<SchedulePage />} />
          {/* Session detail is deep-linkable and renders over the schedule. */}
          <Route path="/e/:slug/s/:sessionId" element={<SchedulePage />} />
          <Route path="/e/:slug/p/:personId" element={<ProfilePage />} />
          <Route path="/e/:slug/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}
