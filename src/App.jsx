import { Theme } from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import EventList from './components/EventList';
import EventDetails from './components/EventDetails';
import './App.css';

function App() {
  return (
    <Theme
      appearance="light"
      accentColor="crimson"
      grayColor="gray"
      panelBackground="solid"
      scaling="100%"
      radius="medium"
    >
      <Router>
        <div className="app">
          <Routes>
            <Route path="/" element={<EventList />} />
            <Route path="/event/:eventId" element={<EventDetails />} />
          </Routes>
        </div>
      </Router>
    </Theme>
  );
}

export default App;