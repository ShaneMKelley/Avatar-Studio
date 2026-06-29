import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff, Server, Activity, Compass, RefreshCw, Send, ShieldAlert } from 'lucide-react';
import { useStore } from '../store/useStore';
import { syncService } from '../services/sync';

export const ConnectionStatus = () => {
  const [socketConnected, setSocketConnected] = useState(false);
  const [peerConnected, setPeerConnected] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  
  const connectedUsersCount = useStore(
    state => Object.keys(state.users).length
  );
  const usersDict = useStore(state => state.users);
  const currentRoom = useStore(state => state.currentRoom);
  const localUserName = useStore(state => state.localUserName);
  const localUserId = useStore(state => state.localUserId);

  useEffect(() => {
    // Check Socket.io connection state
    const checkSocket = setInterval(() => {
      // @ts-ignore
      if (syncService.socket && syncService.socket.connected) {
        setSocketConnected(true);
      } else {
        setSocketConnected(false);
      }
    }, 1000);

    // Check PeerJS connection state
    const checkPeer = setInterval(() => {
      // @ts-ignore
      if (syncService.peer && !syncService.peer.disconnected && !syncService.peer.destroyed) {
        setPeerConnected(true);
      } else {
        setPeerConnected(false);
      }
    }, 2000);

    return () => {
      clearInterval(checkSocket);
      clearInterval(checkPeer);
    };
  }, []);

  const getRoomLabel = (roomId: string) => {
    switch (roomId) {
      case 'main': return 'Main Lobby';
      case 'club': return 'Neon Club';
      case 'lounge': return 'Chill Lounge';
      case 'arena': return 'Battle Arena';
      default: return roomId.toUpperCase();
    }
  };

  const handleJoinPlayerRoom = (roomId: string) => {
    syncService.changeRoom(roomId);
  };

  const handleTeleportToCoordinates = (x: number, y: number, z: number) => {
    const event = new CustomEvent('teleport-local-player', { detail: { x, y, z } });
    window.dispatchEvent(event);
  };

  const handleForceReconnect = async () => {
    setReconnecting(true);
    try {
      console.log("[Diagnostics] Triggering manual signaling & socket reset...");
      await syncService.initialize();
    } catch (err) {
      console.error("[Diagnostics] Sync initialization failed:", err);
    } finally {
      setTimeout(() => setReconnecting(false), 1200);
    }
  };

  if (!expanded) {
    return (
      <button 
        onClick={() => setExpanded(true)}
        className="absolute bottom-4 left-4 z-50 bg-zinc-950/90 backdrop-blur-md rounded-full p-2.5 border border-white/10 shadow-lg hover:bg-zinc-800 hover:border-cyan-500/40 transition-all flex items-center gap-2 group"
        title="Open Multiplayer Diagnostics & Nexus HUD"
      >
        <div className="relative flex h-3 w-3">
          {socketConnected && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          )}
          <span className={`relative inline-flex rounded-full h-3 w-3 ${socketConnected ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
        </div>
        <Activity className="w-4 h-4 text-white group-hover:text-cyan-400 transition-colors" />
        <span className="text-xs text-zinc-300 font-bold font-mono pr-1 group-hover:text-white transition-colors">
          {connectedUsersCount + 1} ONLINE
        </span>
      </button>
    );
  }

  return (
    <div className="absolute bottom-4 left-4 z-50 bg-zinc-950/95 backdrop-blur-md rounded-xl p-4 border border-cyan-500/20 shadow-2xl min-w-[310px] max-w-[340px] animate-in fade-in slide-in-from-bottom-4 flex flex-col gap-3 max-h-[480px] overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center pb-2 border-b border-white/10">
        <div className="flex items-center gap-1.5">
          <Compass className="w-4 h-4 text-cyan-400 animate-spin-slow" />
          <h3 className="text-xs font-black text-zinc-200 uppercase tracking-widest font-mono">Multiplayer Nexus</h3>
        </div>
        <button 
          onClick={() => setExpanded(false)} 
          className="text-zinc-500 hover:text-white bg-zinc-900/50 hover:bg-zinc-800 p-1 rounded transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>

      <div className="space-y-3 flex-1 overflow-y-auto pr-1">
        {/* Connection States */}
        <div className="grid grid-cols-2 gap-2">
          {/* Socket.IO Status */}
          <div className="flex items-center gap-2 bg-zinc-900/50 border border-white/5 p-2 rounded-lg">
            <div className={`p-1 rounded-md ${socketConnected ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
              <Server className={`w-3.5 h-3.5 ${socketConnected ? 'text-emerald-400' : 'text-red-400'}`} />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider font-mono">Signaling</span>
              <span className={`text-[11px] font-black font-mono truncate ${socketConnected ? 'text-emerald-400' : 'text-red-400'}`}>
                {socketConnected ? 'CONNECTED' : 'OFFLINE'}
              </span>
            </div>
          </div>

          {/* PeerJS Status */}
          <div className="flex items-center gap-2 bg-zinc-900/50 border border-white/5 p-2 rounded-lg">
            <div className={`p-1 rounded-md ${peerConnected ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
              {peerConnected ? (
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider font-mono">Peer Mesh</span>
              <span className={`text-[11px] font-black font-mono truncate ${peerConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
                {peerConnected ? 'ACTIVE' : 'CONNECTING...'}
              </span>
            </div>
          </div>
        </div>

        {/* Dynamic Players Directory */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest font-mono">Active Users</span>
            <span className="bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded text-[9px] font-mono font-bold">
              {connectedUsersCount + 1} ONLINE
            </span>
          </div>

          <div className="space-y-2 max-h-[160px] overflow-y-auto pr-0.5">
            {/* Local Player Card */}
            <div className="flex flex-col gap-1 bg-emerald-500/5 border border-emerald-500/20 p-2 rounded-lg">
              <div className="flex items-center justify-between min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                  <span className="text-emerald-300 font-bold truncate font-mono text-xs">{localUserName} (You)</span>
                </div>
                <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                  {getRoomLabel(currentRoom)}
                </span>
              </div>
            </div>

            {/* Remote Players Cards */}
            {Object.values(usersDict)
              .filter((u: any) => u.id !== localUserId)
              .map((u: any) => {
              const uRoom = u.roomId || 'main';
              const isSameRoom = uRoom === currentRoom;
              const rName = getRoomLabel(uRoom);
              
              return (
                <div key={u.id} className="flex flex-col gap-2 bg-zinc-900/80 border border-white/5 p-2.5 rounded-lg hover:border-cyan-500/20 transition-all">
                  <div className="flex items-center justify-between min-w-0 gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`h-1.5 w-1.5 rounded-full ${isSameRoom ? 'bg-cyan-400 animate-pulse' : 'bg-zinc-500'}`}></span>
                      <span className="text-zinc-200 font-bold truncate font-mono text-xs">{u.name || `User-${u.id.slice(0, 4)}`}</span>
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-black uppercase border tracking-wider ${
                      isSameRoom 
                        ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' 
                        : 'bg-zinc-800 text-zinc-500 border-white/5'
                    }`}>
                      {rName}
                    </span>
                  </div>

                  {/* Navigation & Teleport Actions */}
                  <div className="flex items-center gap-1.5">
                    {!isSameRoom ? (
                      <button
                        onClick={() => handleJoinPlayerRoom(uRoom)}
                        className="text-[10px] bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-2.5 py-1 rounded font-mono flex items-center gap-1 transition shadow-md shadow-cyan-950/40"
                      >
                        <Compass className="w-3 h-3" /> Warp to {rName}
                      </button>
                    ) : (
                      u.position && (
                        <button
                          onClick={() => handleTeleportToCoordinates(u.position[0], u.position[1], u.position[2])}
                          className="text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white font-bold px-2.5 py-1 rounded font-mono border border-white/10 hover:border-white/20 flex items-center gap-1 transition"
                        >
                          <Send className="w-3 h-3 text-cyan-400" /> Beam to Coordinates
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}

            {Object.keys(usersDict).length === 0 && (
              <div className="flex flex-col items-center justify-center p-4 bg-zinc-900/30 border border-dashed border-white/5 rounded-lg text-center gap-1.5">
                <ShieldAlert className="w-5 h-5 text-zinc-600" />
                <div className="text-[11px] text-zinc-400 font-medium font-sans">No other players connected yet</div>
                <div className="text-[9px] text-zinc-500 leading-relaxed font-sans max-w-[220px]">
                  Duplicate this browser tab or share your link to test dynamic real-time multiplayer!
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Diagnostics / Manual Force Reconnect Action */}
      <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2 bg-zinc-900/20 p-1.5 rounded-lg">
        <span className="text-[9px] font-bold text-zinc-500 font-mono">SYSTEM LOGS: OK</span>
        <button
          onClick={handleForceReconnect}
          disabled={reconnecting}
          className="text-[10px] bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white font-black font-mono px-3 py-1.5 rounded border border-white/10 flex items-center gap-1 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 text-cyan-400 ${reconnecting ? 'animate-spin' : ''}`} />
          {reconnecting ? 'RECONNECTING...' : 'FORCE RE-SYNC'}
        </button>
      </div>
    </div>
  );
};
