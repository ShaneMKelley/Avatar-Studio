import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff, Server, Activity } from 'lucide-react';
import { useStore } from '../store/useStore';
import { syncService } from '../services/sync';

export const ConnectionStatus = () => {
  const [socketConnected, setSocketConnected] = useState(false);
  const [peerConnected, setPeerConnected] = useState(false);
  const [expanded, setExpanded] = useState(false);
  
  const connectedUsersCount = useStore(
    state => Object.keys(state.users).length
  );

  useEffect(() => {
    // Check Socket.io connection
    const checkSocket = setInterval(() => {
      // @ts-ignore
      if (syncService.socket && syncService.socket.connected) {
        setSocketConnected(true);
      } else {
        setSocketConnected(false);
      }
    }, 1000);

    // Check PeerJS connection
    const checkPeer = setInterval(() => {
      // @ts-ignore - Accessing private property for debug status
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

  if (!expanded) {
    return (
      <button 
        onClick={() => setExpanded(true)}
        className="absolute bottom-4 left-4 z-50 bg-zinc-900/80 backdrop-blur-md rounded-full p-2 border border-white/10 shadow-lg hover:bg-zinc-800 transition-all group"
        title="Connection Status"
      >
        <Activity className={`w-5 h-5 ${socketConnected ? 'text-emerald-400' : 'text-red-400'}`} />
      </button>
    );
  }

  return (
    <div className="absolute bottom-4 left-4 z-50 bg-zinc-900/90 backdrop-blur-md rounded-xl p-4 border border-white/10 shadow-xl min-w-[200px] animate-in fade-in slide-in-from-bottom-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">System Status</h3>
        <button onClick={() => setExpanded(false)} className="text-zinc-500 hover:text-white">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>

      <div className="space-y-3">
        {/* Socket.IO Status */}
        <div className="flex items-center gap-3">
          <div className={`p-1.5 rounded-full ${socketConnected ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
            <Server className={`w-4 h-4 ${socketConnected ? 'text-emerald-400' : 'text-red-400'}`} />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-white">Server</span>
            <span className={`text-xs ${socketConnected ? 'text-emerald-400' : 'text-red-400'}`}>
              {socketConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        {/* PeerJS Status */}
        <div className="flex items-center gap-3">
          <div className={`p-1.5 rounded-full ${peerConnected ? 'bg-emerald-500/20' : 'bg-amber-500/20'}`}>
            {peerConnected ? (
              <Wifi className="w-4 h-4 text-emerald-400" />
            ) : (
              <WifiOff className="w-4 h-4 text-amber-400" />
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-white">Signaling</span>
            <span className={`text-xs ${peerConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
              {peerConnected ? 'Active' : 'Connecting...'}
            </span>
          </div>
        </div>

        {/* Network Stats */}
        <div className="pt-2 border-t border-white/10">
          <div className="flex justify-between text-xs text-zinc-400">
            <span>Peers</span>
            <span className="text-white font-mono">{connectedUsersCount}</span>
          </div>
          <div className="flex justify-between text-xs text-zinc-400 mt-1">
            <span>Ping</span>
            <span className="text-emerald-400 font-mono">~45ms</span>
          </div>
        </div>
      </div>
    </div>
  );
};
