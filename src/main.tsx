import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Safeguard Node.prototype.contains to prevent errors when target is null/undefined or not a Node
if (typeof window !== 'undefined' && typeof Node !== 'undefined' && Node.prototype.contains) {
  const originalContains = Node.prototype.contains;
  Node.prototype.contains = function(other: any) {
    if (!other || !(other instanceof Node)) {
      return false;
    }
    return originalContains.call(this, other);
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
