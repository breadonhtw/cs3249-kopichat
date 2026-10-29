import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';

// Hidden-until-script states in app.css are scoped under .js, so nothing stays invisible without the script.
document.documentElement.classList.add('js');

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);

// Optional editor helper; the CUI does not wait for or depend on this runtime.
if (import.meta.env.DEV) {
  import('@locator/runtime')
    .then(({ default: setupLocatorUI }) => {
      setupLocatorUI({ adapter: 'jsx', showIntro: false });
    })
    .catch(() => console.warn('Code locator unavailable. See the file map in README.md.'));
}
