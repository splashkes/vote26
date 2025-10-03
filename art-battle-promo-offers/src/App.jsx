import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Theme } from '@radix-ui/themes'
import PublicOfferViewer from './components/PublicOfferViewer'
import AdminDashboard from './components/AdminDashboard'
import { AuthProvider } from './contexts/AuthContext'

function App() {
  return (
    <Theme appearance="dark" accentColor="blue" radius="large">
      <AuthProvider>
        <Router>
          <Routes>
            {/* Public route - hash-based access */}
            <Route path="/o/:hash" element={<PublicOfferViewer />} />

            {/* Admin routes - require authentication */}
            <Route path="/o/admin" element={<AdminDashboard />} />
            <Route path="/o/admin/offers" element={<AdminDashboard />} />
            <Route path="/o/admin/offers/:offerId" element={<AdminDashboard />} />

            {/* 404 catch-all - friendly message for end users */}
            <Route path="*" element={
              <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: '1rem',
                padding: '2rem',
                textAlign: 'center',
                background: '#000'
              }}>
                <img
                  src="https://artb.tor1.cdn.digitaloceanspaces.com/img/AB-HWOT1.png"
                  alt="Art Battle"
                  style={{ height: '60px', width: 'auto', marginBottom: '1rem' }}
                />
                <h1 style={{ fontSize: '3rem', color: '#fff' }}>Invalid Offer Link</h1>
                <p style={{ color: '#999', maxWidth: '400px' }}>
                  This offer link is invalid or has expired. Please check your link and try again.
                </p>
                <p style={{ color: '#666', fontSize: '0.875rem', marginTop: '2rem' }}>
                  Questions? Contact us at <a href="mailto:hello@artbattle.com" style={{ color: 'var(--accent-9)' }}>hello@artbattle.com</a>
                </p>
              </div>
            } />
          </Routes>
        </Router>
      </AuthProvider>
    </Theme>
  )
}

export default App
