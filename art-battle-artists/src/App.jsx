import { Theme } from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MainNavigation from './components/MainNavigation';
import ProfileView from './components/ProfileView';
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
        <Router basename="/profile">
          <div className="app">
            <Routes>
              <Route path="/" element={<MainNavigation />} />
              <Route path="/artist/:id" element={<ProfileView />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </Router>
      </AuthProvider>
    </Theme>
  );
}

export default App;