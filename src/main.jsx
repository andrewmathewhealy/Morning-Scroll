import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// Lazy-load admin so Firebase isn't bundled into the main app
if (window.location.pathname === '/admin') {
  import('./Admin.jsx').then(({ default: AdminApp }) => {
    createRoot(document.getElementById('root')).render(
      <StrictMode>
        <AdminApp />
      </StrictMode>,
    );
  });
} else {
  import('./App.jsx').then(({ default: App }) => {
    createRoot(document.getElementById('root')).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
}
