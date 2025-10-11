import { Theme } from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import AdminLayout from './components/AdminLayout';
import LoginPage from './components/LoginPage';
import EventDashboard from './components/EventDashboard';
import EventDetail from './components/EventDetail';
import CityDetail from './components/CityDetail';
import CreateEvent from './components/CreateEvent';
import ArtistManagement from './components/ArtistManagement';
import HealthMonitor from './components/HealthMonitor';
import LiveMonitor from './components/LiveMonitor';
import ArtworkManagement from './components/ArtworkManagement';
import ArtistsManagement from './components/ArtistsManagement';
import PeopleManagement from './components/PeopleManagement';
import HealthRecommendations from './components/HealthRecommendations';
import AdminUsers from './components/AdminUsers';
import InvitationManagement from './components/InvitationManagement';
import EmailQueueDashboard from './components/EmailQueueDashboard';
import EmailQueueManager from './components/EmailQueueManager';
import PromotionSystem from './components/PromotionSystem';
import BulkArtistView from './components/BulkArtistView';
import ContentLibrary from './components/ContentLibrary';
import PaymentsAdminTabbed from './components/PaymentsAdminTabbed';
import DuplicateProfileResolver from './components/DuplicateProfileResolver';
import EventLinter from './components/EventLinter';
import VenuesManagement from './components/VenuesManagement';
import SponsorshipPackages from './components/sponsorship/SponsorshipPackages';
import EventRelationshipBackfill from './components/EventRelationshipBackfill';
import Welcome from './components/Welcome';
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
              <Route path="/welcome" element={<Welcome />} />
              <Route path="/" element={<AdminLayout />}>
                <Route index element={<Navigate to="/events" replace />} />
                <Route path="events" element={<EventDashboard />} />
                <Route path="events/create" element={<CreateEvent />} />
                <Route path="events/:eventId" element={<EventDetail />} />
                <Route path="events/:eventId/artists" element={<ArtistManagement />} />
                <Route path="events/:eventId/art" element={<ArtworkManagement />} />
                <Route path="events/:eventId/health" element={<HealthMonitor />} />
                <Route path="events/:eventId/live" element={<LiveMonitor />} />
                <Route path="cities/:cityId" element={<CityDetail />} />
                <Route path="artists" element={<ArtistsManagement />} />
                <Route path="artists/bulk-management" element={<BulkArtistView />} />
                <Route path="content" element={<ContentLibrary />} />
                <Route path="people" element={<PeopleManagement />} />
                <Route path="health" element={<HealthRecommendations />} />
                <Route path="admin-users" element={<AdminUsers />} />
                <Route path="invitations" element={<InvitationManagement />} />
                <Route path="email-queue" element={<EmailQueueDashboard />} />
                <Route path="email-queue/:eventEid" element={<EmailQueueManager />} />
                <Route path="payments" element={<PaymentsAdminTabbed />} />
                <Route path="duplicate-profiles" element={<DuplicateProfileResolver />} />
                <Route path="event-linter" element={<EventLinter />} />
                <Route path="venues" element={<VenuesManagement />} />
                <Route path="sponsorship-packages" element={<SponsorshipPackages />} />
                <Route path="event-relationships" element={<EventRelationshipBackfill />} />
                <Route path="sms-marketing" element={<PromotionSystem />} />
                <Route path="artist/:entryId" element={<ArtistsManagement />} />
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