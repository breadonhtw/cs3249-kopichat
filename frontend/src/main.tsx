import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { FormApp } from './components/FormApp.tsx';
import { Review } from './components/Review.tsx';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import './styles/review.css';

// Hidden-until-script states in app.css are scoped under .js, so nothing stays invisible without the script.
document.documentElement.classList.add('js');

// /review is the NUSSU reviewer view and /form the user study's matched form; every other path is the chat.
const path = window.location.pathname.replace(/\/+$/, '');
const reviewing = path === '/review';
const form = path === '/form';

createRoot(document.getElementById('root')!).render(
  <StrictMode>{reviewing ? <Review /> : form ? <FormApp /> : <App />}</StrictMode>,
);

// Optional editor helper; the CUI does not wait for or depend on this runtime.
if (import.meta.env.DEV) {
  import('@locator/runtime')
    .then(({ default: setupLocatorUI }) => {
      setupLocatorUI({ adapter: 'jsx', showIntro: false });
    })
    .catch(() => console.warn('Code locator unavailable. See the file map in README.md.'));
}
