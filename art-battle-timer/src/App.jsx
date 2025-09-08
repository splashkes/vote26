import { Theme } from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import TimerDisplay from './components/TimerDisplay';
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
      <Router basename="/timer">
        <div className="app">
          <Routes>
            <Route path="/:eid" element={<TimerDisplay />} />
            <Route path="/" element={
              <div className="error-message">
                <div>Event ID required</div>
                <div style={{fontSize: '0.8em', marginTop: '1em', color: '#666'}}>
                  Use: /timer/AB3344 (where AB3344 is your event ID)
                </div>
              </div>
            } />
          </Routes>
        </div>
      </Router>
    </Theme>
  );
}

export default App;