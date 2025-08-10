import { Theme } from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import AdminLayout from './components/AdminLayout';
import LoginPage from './components/LoginPage';
import EventDashboard from './components/EventDashboard';
import EventDetail from './components/EventDetail';
import ArtistManagement from './components/ArtistManagement';
import './App.css';

function App() {
  return (
    <Theme
      appearance="dark"
      accentColor="crimson"
      grayColor="slate"
      panelBackground="solid"
      scaling="100%"
      radius="medium"
    >
      <AuthProvider>
        <Router basename="/admin">
          <div className="app">
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={<AdminLayout />}>
                <Route index element={<Navigate to="/events" replace />} />
                <Route path="events" element={<EventDashboard />} />
                <Route path="events/:eventId" element={<EventDetail />} />
                <Route path="events/:eventId/artists" element={<ArtistManagement />} />
                <Route path="*" element={<Navigate to="/events" replace />} />
              </Route>
            </Routes>
          </div>
        </Router>
      </AuthProvider>
    </Theme>
  );
}

export default App;