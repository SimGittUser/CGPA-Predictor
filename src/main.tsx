import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import App from './App';
import { ConfirmProvider } from './components/motion';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfirmProvider>
      <App />
      <Analytics />
    </ConfirmProvider>
  </StrictMode>,
);
