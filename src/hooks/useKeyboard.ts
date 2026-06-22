import { useState, useEffect } from 'react';

export function useKeyboard(active: boolean = true) {
  const [keys, setKeys] = useState({
    w: false,
    a: false,
    s: false,
    d: false,
    shift: false,
    space: false,
  });

  useEffect(() => {
    if (!active) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      const key = e.key.toLowerCase();
      if (keys.hasOwnProperty(key)) {
        setKeys((k) => ({ ...k, [key]: true }));
      }
      if (e.key === 'Shift') {
        setKeys((k) => ({ ...k, shift: true }));
      }
      if (e.key === ' ') {
        setKeys((k) => ({ ...k, space: true }));
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const key = e.key.toLowerCase();
      if (keys.hasOwnProperty(key)) {
        setKeys((k) => ({ ...k, [key]: false }));
      }
      if (e.key === 'Shift') {
        setKeys((k) => ({ ...k, shift: false }));
      }
      if (e.key === ' ') {
        setKeys((k) => ({ ...k, space: false }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [active, keys]);

  return keys;
}
