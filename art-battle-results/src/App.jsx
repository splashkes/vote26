import { Theme } from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ArtworkResolver from './components/ArtworkResolver';
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
      <Router basename="/results">
        <div className="app">
          <Routes>
            <Route path="/:artworkId" element={<ArtworkResolver />} />
            <Route path="/index.html" element={<Navigate to="/" replace />} />
            <Route path="/" element={
              <div>
                <h1>Art Battle Results</h1>
                <p>Enter an event ID in the URL (e.g., /results/AB2900)</p>
              </div>
            } />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </Router>
    </Theme>
  );
}

export default App;