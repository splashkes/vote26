import { Theme } from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import EventListV2Fixed from './components/EventListV2Fixed';
import EventDetails from './components/EventDetails';
import PaymentReceipt from './components/PaymentReceipt';
import TestCloudflare from './components/TestCloudflare';
import EidResolver from './components/EidResolver';
import UpgradeHandler from './components/UpgradeHandler';
import { AuthProvider } from './contexts/AuthContext';
import './App.css';

function App() {
  console.log("🚀 ART BATTLE VOTE V2 - CACHED VERSION LOADED 🚀");
  console.log("Version: V2-CACHED");
  console.log("Build timestamp:", new Date().toISOString());
  
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
        <Router basename="/v2">
          <div className="app">
            {/* V2 Visual Indicator */}
            <div style={{
              position: 'fixed',
              top: '10px',
              right: '10px',
              background: '#e93d82',
              color: 'white',
              padding: '8px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 'bold',
              zIndex: 9999,
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
            }}>
              V2 CACHED
            </div>
            <Routes>
              <Route path="/" element={<EventListV2Fixed />} />
              <Route path="/event/:eventId" element={<EventDetails />} />
              <Route path="/e/:eid/:tab" element={<EidResolver />} />
              <Route path="/e/:eid" element={<EidResolver />} />
              <Route path="/upgrade/:qrCode" element={<UpgradeHandler />} />
              <Route path="/payment/:sessionId" element={<PaymentReceipt />} />
              <Route path="/test-cloudflare" element={<TestCloudflare />} />
              <Route path="/index.html" element={<EventListV2Fixed />} />
              <Route path="*" element={<EventListV2Fixed />} />
            </Routes>
          </div>
        </Router>
      </AuthProvider>
    </Theme>
  );
}

export default App;