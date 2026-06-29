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

// Ignore specific Three.js WebGPU warnings for materials we auto-transcode
const originalConsoleError = console.error;
console.error = function (...args: any[]) {
  if (typeof args[0] === 'string' && args[0].includes('THREE.NodeBuilder: Material "ShaderMaterial" is not compatible.')) {
    return;
  }
  originalConsoleError.apply(console, args);
};

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
