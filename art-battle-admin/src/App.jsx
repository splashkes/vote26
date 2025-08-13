import { Theme } from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import AdminLayout from './components/AdminLayout';
import LoginPage from './components/LoginPage';
import EventDashboard from './components/EventDashboard';
import EventDetail from './components/EventDetail';
import ArtistManagement from './components/ArtistManagement';
import HealthMonitor from './components/HealthMonitor';
import LiveMonitor from './components/LiveMonitor';
import ArtworkManagement from './components/ArtworkManagement';
import AllArtists from './components/AllArtists';
import PeopleManagement from './components/PeopleManagement';
import HealthRecommendations from './components/HealthRecommendations';
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
                <Route path="events/:eventId/art" element={<ArtworkManagement />} />
                <Route path="events/:eventId/health" element={<HealthMonitor />} />
                <Route path="events/:eventId/live" element={<LiveMonitor />} />
                <Route path="artists" element={<AllArtists />} />
                <Route path="people" element={<PeopleManagement />} />
                <Route path="health" element={<HealthRecommendations />} />
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