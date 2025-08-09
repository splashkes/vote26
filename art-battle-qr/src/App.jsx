import { Theme } from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import QRDisplay from './components/QRDisplay';
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
      <Router basename="/qr">
        <div className="app">
          <Routes>
            <Route path="/:secretToken" element={<QRDisplay />} />
            <Route path="/" element={<div className="error-message">Secret token required</div>} />
          </Routes>
        </div>
      </Router>
    </Theme>
  );
}

export default App;