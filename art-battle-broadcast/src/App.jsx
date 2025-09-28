import { Theme } from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import EventList from './components/EventList';
import EventDetails from './components/EventDetails';
import PaymentReceipt from './components/PaymentReceipt';
import TestCloudflare from './components/TestCloudflare';
import EidResolver from './components/EidResolver';
import UpgradeHandler from './components/UpgradeHandler';
import { AuthProvider } from './contexts/AuthContext';
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
        <Router basename="/">
          <div className="app">
            <Routes>
              <Route path="/" element={<EventList />} />
              <Route path="/event/:eventId" element={<EventDetails />} />
              <Route path="/event/:eventId/art/:artworkId" element={<EventDetails />} />
              <Route path="/e/:eid/:tab" element={<EidResolver />} />
              <Route path="/e/:eid" element={<EidResolver />} />
              <Route path="/upgrade/:qrCode" element={<UpgradeHandler />} />
              <Route path="/payment/:sessionId" element={<PaymentReceipt />} />
              <Route path="/test-cloudflare" element={<TestCloudflare />} />
              <Route path="/index.html" element={<EventList />} />
              <Route path="*" element={<EventList />} />
            </Routes>
          </div>
        </Router>
      </AuthProvider>
    </Theme>
  );
}

export default App;