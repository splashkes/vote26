// Removed StrictMode to prevent double mounting and duplicate API calls
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// GLOBAL MOUNT GUARD: Prevent double app mounting
if (window.__APP_MOUNTED__) {
  console.error('🚨 [APP-MOUNT] App already mounted! Preventing duplicate mount.');
  // Exit early to prevent duplicate render
} else {
  console.log('✅ [APP-MOUNT] First app mount, proceeding...');
  window.__APP_MOUNTED__ = true;

  // Global error handling for unhandled promises and errors
  window.addEventListener('error', (event) => {
    console.error('Global error caught:', event.error);
    console.error('Error occurred in:', event.filename, 'at line:', event.lineno);
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    // Prevent the default browser behavior of logging to console
    event.preventDefault();
  });

  // Render the app
  createRoot(document.getElementById('root')).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  );
}