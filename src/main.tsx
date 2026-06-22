/// <reference types="vite/client" />
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { GoogleReCaptchaProvider } from 'react-google-recaptcha-v3';

// To avoid crashing if not set, use a fallback
const reCaptchaKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY || "dummy";

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {reCaptchaKey !== "dummy" ? (
      <GoogleReCaptchaProvider reCaptchaKey={reCaptchaKey}>
        <App />
      </GoogleReCaptchaProvider>
    ) : (
       <App />
    )}
  </StrictMode>,
);
