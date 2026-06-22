import React, { useState, useEffect } from 'react';
import { createXRStore } from '@react-three/xr';
import { Glasses } from 'lucide-react';
import { useStore } from '../store/useStore';

// We need to share the store instance with the Canvas
export const xrStore = createXRStore();

export const VRInterface = () => {
  const [isSupported, setIsSupported] = useState(false);
  const isAvatarStudioOpen = useStore(state => state.isAvatarStudioOpen);

  useEffect(() => {
    if ('xr' in navigator) {
      // @ts-ignore - navigator.xr types might be missing
      navigator.xr.isSessionSupported('immersive-vr').then((supported: boolean) => {
        setIsSupported(supported);
      }).catch(() => {
        setIsSupported(false);
      });
    }
  }, []);

  const handleEnterVR = () => {
    try {
      xrStore.enterVR();
    } catch (err) {
      console.error(err);
      alert("WebVR/XR session initiation failed. Please make sure VR headsets or desktop emulation are configured.");
    }
  };

  return (
    <button
      id="enter-vr-btn"
      onClick={handleEnterVR}
      title="Enter VR / WebXR"
      className={`absolute top-[128px] left-4 bg-zinc-900/80 backdrop-blur-md p-3 rounded-full border transition-all shadow-lg hover:bg-zinc-800 duration-300 ${
        isAvatarStudioOpen 
          ? 'opacity-0 scale-95 pointer-events-none z-0' 
          : 'opacity-100 scale-100 pointer-events-auto z-40'
      } ${
        isSupported 
          ? 'border-emerald-500/50 text-emerald-400 hover:border-emerald-500 hover:shadow-[0_0_15px_rgba(16,185,129,0.3)]' 
          : 'border-white/10 text-white hover:border-white/20'
      }`}
    >
      <Glasses className="w-6 h-6" />
    </button>
  );
};
