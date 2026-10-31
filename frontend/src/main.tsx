import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Review } from './components/Review.tsx';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import './styles/review.css';

// Hidden-until-script states in app.css are scoped under .js, so nothing stays invisible without the script.
document.documentElement.classList.add('js');

// /review is the NUSSU reviewer view; every other path is the student's consultation.
const reviewing = window.location.pathname.replace(/\/+$/, '') === '/review';

createRoot(document.getElementById('root')!).render(
  <StrictMode>{reviewing ? <Review /> : <App />}</StrictMode>,
);

// Optional editor helper; the CUI does not wait for or depend on this runtime.
if (import.meta.env.DEV) {
  import('@locator/runtime')
    .then(({ default: setupLocatorUI }) => {
      setupLocatorUI({ adapter: 'jsx', showIntro: false });
    })
    .catch(() => console.warn('Code locator unavailable. See the file map in README.md.'));
}
