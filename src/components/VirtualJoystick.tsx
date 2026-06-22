import React, { useEffect, useRef } from 'react';
import nipplejs from 'nipplejs';
import { useStore } from '../store/useStore';

export const VirtualJoystick = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Only show on touch devices
    if (!('ontouchstart' in window) || navigator.maxTouchPoints === 0) {
      return;
    }

    if (!containerRef.current) return;

    const manager = nipplejs.create({
      zone: containerRef.current,
      mode: 'dynamic',
      color: 'rgba(16, 185, 129, 0.5)', // emerald-500
      size: 100,
    });

    // @ts-ignore
    manager.on('move', (evt: any, data: any) => {
      // Convert joystick angle/force to movement vector
      // data.vector.x and data.vector.y are between -1 and 1
      useStore.getState().setJoystickVector({
        x: data.vector.x,
        y: data.vector.y
      });
    });

    // @ts-ignore
    manager.on('end', () => {
      useStore.getState().setJoystickVector({ x: 0, y: 0 });
    });

    return () => {
      manager.destroy();
    };
  }, []);

  // Only render on touch devices
  if (!('ontouchstart' in window) || navigator.maxTouchPoints === 0) {
    return null;
  }

  return (
    <div 
      className="absolute top-0 left-0 z-40 w-1/2 h-full md:hidden"
      ref={containerRef}
      style={{ touchAction: 'none' }}
    />
  );
};
