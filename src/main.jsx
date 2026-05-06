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
  }).catch(e => console.error('Admin load failed', e));
} else {
  import('./App.jsx').then(({ default: App }) => {
    createRoot(document.getElementById('root')).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  }).catch(e => {
    console.error('App load failed', e);
    document.getElementById('root').innerHTML = '<pre style="color:white;padding:20px">' + e.message + '\n' + e.stack + '</pre>';
  });
}
