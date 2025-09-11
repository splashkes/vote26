import { Theme } from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import EventSelector from './components/EventSelector';
import ArtistGallery from './components/ArtistGallery';
import DesignerStudio from './components/DesignerStudio';
import LoginPage from './components/LoginPage';
import ProtectedRoute from './components/ProtectedRoute';
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
        <Router basename="/promo">
          <div className="app">
            <Routes>
              <Route path="/" element={<EventSelector />} />
              <Route path="/e/:eventId" element={<ArtistGallery />} />
              <Route path="/login" element={<LoginPage />} />
              <Route 
                path="/designer" 
                element={
                  <ProtectedRoute>
                    <DesignerStudio />
                  </ProtectedRoute>
                } 
              />
            </Routes>
          </div>
        </Router>
      </AuthProvider>
    </Theme>
  );
}

export default App;
