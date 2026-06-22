import React from 'react';
import { useStore } from '../store/useStore';
import { useGameStore } from '../store';
import { Navigation } from 'lucide-react';

export const Minimap = () => {
  const showMinimap = useStore(state => state.showMinimap);
  const localUserPosition = useStore(state => state.localUserPosition);
  const localUserRotation = useStore(state => state.localUserRotation);
  const users = useStore(state => state.users);
  const crystals = useStore(state => state.crystals);
  const npcPosition = useStore(state => state.npcPosition);
  const currentRoom = useStore(state => state.currentRoom);
  const otherPlayers = useGameStore(state => state.otherPlayers);
  const enemies = useGameStore(state => state.enemies);

  // Proximity detection: Check if any other players are nearby inside the Arena (within 38m)
  const isNearbyInArena = React.useMemo(() => {
    if (currentRoom !== 'arena' || !localUserPosition) return false;
    const localPos = localUserPosition;
    return Object.values(otherPlayers).some((p) => {
      if (!p.position) return false;
      const dx = p.position[0] - localPos[0];
      const dz = p.position[2] - localPos[2];
      const dist = Math.sqrt(dx * dx + dz * dz);
      return dist <= 38.0;
    });
  }, [currentRoom, localUserPosition, otherPlayers]);

  const [pingActive, setPingActive] = React.useState(false);

  React.useEffect(() => {
    if (!isNearbyInArena) {
      setPingActive(false);
      return;
    }

    // Trigger radar ping sweeps (1.6s duration) periodically every 4.5s when enemies/players are near
    setPingActive(true);
    const initTimeout = setTimeout(() => setPingActive(false), 1600);

    const interval = setInterval(() => {
      setPingActive(true);
      setTimeout(() => setPingActive(false), 1600);
    }, 4500);

    return () => {
      clearInterval(interval);
      clearTimeout(initTimeout);
    };
  }, [isNearbyInArena]);

  const radarSize = typeof window !== 'undefined' && window.innerWidth < 768 ? 100 : 160; // px

  // Calculate coordinates relative to the local player to keep radar centered
  const getCoords = (pos: [number, number, number] | undefined) => {
    if (!pos || !localUserPosition) {
      return { left: '50%', top: '50%', visible: false };
    }
    const dx = pos[0] - localUserPosition[0];
    const dz = pos[2] - localUserPosition[2];

    const maxRadarRange = 50; // Tactical view radius in meters bounds
    const pctX = 50 + (dx / maxRadarRange) * 50;
    const pctY = 50 + (dz / maxRadarRange) * 50;

    const distance = Math.sqrt(dx * dx + dz * dz);
    return {
      left: `${pctX}%`,
      top: `${pctY}%`,
      visible: distance <= maxRadarRange * 1.5
    };
  };

  // Determine portals based on the current room
  let portals: { name: string; position: [number, number, number]; color: string }[] = [];
  if (currentRoom === 'main') {
    portals = [
      { name: 'Neon Club', position: [20, 0, 0], color: '#ff00ff' },
      { name: 'Battle Arena', position: [-20, 0, 0], color: '#ff4400' },
      { name: 'Chill Lounge', position: [0, 0, 20], color: '#00ff88' },
      { name: 'Synth Garden', position: [0, 0, -20], color: '#10b981' }
    ];
  } else if (currentRoom === 'arena') {
    portals = [
      { name: 'Exit to Lobby', position: [0, -0.5, -5], color: '#ef4444' }
    ];
  } else if (currentRoom === 'club' || currentRoom === 'lounge' || currentRoom === 'garden') {
    portals = [
      { name: 'Return to Main', position: [0, 0, 20], color: '#cbd5e1' }
    ];
  }

  // Combine remote players depending on room
  const displayPlayers = currentRoom === 'arena'
    ? Object.values(otherPlayers).map(p => ({
        id: p.id,
        name: p.name,
        position: p.position,
        rotationVal: p.rotation,
      }))
    : Object.values(users).map(u => ({
        id: u.id,
        name: u.name,
        position: u.position,
        rotationVal: u.rotation[1],
      }));
  
  if (!showMinimap) return null;

  return (
    <div className="absolute bottom-4 left-4 z-10 bg-zinc-950/80 backdrop-blur-md rounded-full border-2 border-white/10 shadow-2xl overflow-hidden" style={{ width: radarSize, height: radarSize }}>
      {/* Radar Grid/Background */}
      <div className="absolute inset-0 rounded-full border border-emerald-500/20" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-full h-[1px] bg-emerald-500/20" />
        <div className="h-full w-[1px] bg-emerald-500/20 absolute" />
        <div className="w-1/2 h-1/2 rounded-full border border-emerald-500/20 absolute" />
      </div>

      {/* Crystals */}
      {currentRoom !== 'arena' && Object.values(crystals).map(crystal => {
        const coords = getCoords(crystal.position);
        if (!coords.visible) return null;
        return (
          <div
            key={crystal.id}
            className="absolute w-1.5 h-1.5 bg-sky-400 rounded-full shadow-[0_0_8px_#38bdf8] transform -translate-x-1/2 -translate-y-1/2"
            style={{
              left: coords.left,
              top: coords.top,
            }}
            title="Cyber Crystal"
          />
        );
      })}

      {/* Enemies (only in Arena) */}
      {currentRoom === 'arena' && enemies.map(enemy => {
        const coords = getCoords(enemy.position);
        if (!coords.visible) return null;
        return (
          <div
            key={enemy.id}
            className={`absolute transform -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20 transition-all duration-300 ${
              enemy.state === 'disabled'
                ? 'w-1.5 h-1.5 bg-zinc-600 shadow-none'
                : enemy.type === 'boss'
                  ? 'w-3.5 h-3.5 bg-red-600 shadow-[0_0_12px_#ff003c] animate-pulse border-red-400'
                  : 'w-2 h-2 bg-orange-500 shadow-[0_0_8px_#f97316]'
            }`}
            style={{
              left: coords.left,
              top: coords.top,
            }}
            title={enemy.type === 'boss' ? 'Sentinel Overlord' : 'Sentinel Guard'}
          />
        );
      })}

      {/* Room Portals */}
      {portals.map((portal, idx) => {
        const coords = getCoords(portal.position);
        if (!coords.visible) return null;
        return (
          <div
            key={idx}
            className="absolute w-2.5 h-2.5 rounded-full border-2 transform -translate-x-1/2 -translate-y-1/2 animate-pulse"
            style={{
              left: coords.left,
              top: coords.top,
              borderColor: portal.color,
              boxShadow: `0 0 8px ${portal.color}`,
            }}
            title={`${portal.name} Portal`}
          />
        );
      })}

      {/* Gemma NPC */}
      {npcPosition && getCoords(npcPosition).visible && (() => {
        const coords = getCoords(npcPosition);
        return (
          <React.Fragment key="gemma-npc">
            <div
              className="absolute w-2.5 h-2.5 bg-purple-500 rounded-full transform -translate-x-1/2 -translate-y-1/2 animate-ping"
              style={{
                left: coords.left,
                top: coords.top,
              }}
            />
            <div
              className="absolute w-2.5 h-2.5 bg-purple-600 rounded-full border border-white shadow-[0_0_8px_#a855f7] transform -translate-x-1/2 -translate-y-1/2"
              style={{
                left: coords.left,
                top: coords.top,
              }}
              title="Gemma NPC"
            />
          </React.Fragment>
        );
      })()}

      {/* Remote Users */}
      {displayPlayers.map(user => {
        const coords = getCoords(user.position);
        if (!coords.visible) return null;
        return (
          <div
            key={user.id}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 transition-transform duration-100"
            style={{
              left: coords.left,
              top: coords.top,
              transform: `translate(-50%, -50%) rotate(${-user.rotationVal - Math.PI / 4}rad)`,
            }}
            title={user.name}
          >
            <Navigation className="w-3 h-3 text-red-400 fill-red-400/50" />
          </div>
        );
      })}

      {/* Local User - Staying centered exactly at 50%, 50% */}
      <div
        className="absolute transform -translate-x-1/2 -translate-y-1/2 transition-transform duration-100"
        style={{
          left: '50%',
          top: '50%',
          transform: `translate(-50%, -50%) rotate(${-localUserRotation[1] - Math.PI / 4}rad)`,
        }}
        title="You"
      >
        <Navigation className="w-4 h-4 text-emerald-400 fill-emerald-400/50" />
      </div>

      {/* Proximity Radar Pulse Animation Overlay */}
      {pingActive && (
        <div 
          className="absolute pointer-events-none rounded-full border-2 w-10 h-10 animate-radar-ping"
          style={{
            left: '50%',
            top: '50%',
          }}
        />
      )}

      {/* Radial sweep CSS injector */}
      <style>{`
        @keyframes radar-ping-wave {
          0% {
            transform: translate(-50%, -50%) scale(0);
            opacity: 0.95;
            border-color: rgba(34, 211, 238, 0.95);
            box-shadow: 0 0 4px rgba(34, 211, 238, 0.5), inset 0 0 4px rgba(34, 211, 238, 0.3);
          }
          100% {
            transform: translate(-50%, -50%) scale(5.5);
            opacity: 0;
            border-color: rgba(34, 211, 238, 0);
            box-shadow: 0 0 20px rgba(34, 211, 238, 0), inset 0 0 20px rgba(34, 211, 238, 0);
          }
        }
        .animate-radar-ping {
          animation: radar-ping-wave 1.6s cubic-bezier(0.1, 0.8, 0.3, 1) infinite;
        }
      `}</style>
    </div>
  );
};
