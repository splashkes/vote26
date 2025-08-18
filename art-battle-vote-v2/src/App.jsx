import { Theme } from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import EventListV2 from './components/EventListV2'
import EventDetailsV2 from './components/EventDetailsV2'
import AuthModal from './components/shared/AuthModal'
import './App.css'

function App() {
  // V2 version indicator
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
              <Route path="/" element={<EventListV2 />} />
              <Route path="/event/:eid" element={<EventDetailsV2 />} />
              <Route path="/login" element={<AuthModal />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </Router>
      </AuthProvider>
    </Theme>
  )
}

export default App