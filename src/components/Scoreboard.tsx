import React from 'react';
import { useStore } from '../store/useStore';
import { Trophy } from 'lucide-react';

export const Scoreboard = () => {
  const localUserId = useStore(state => state.localUserId);
  const localUserName = useStore(state => state.localUserName);
  const localUserScore = useStore(state => state.localUserScore);
  
  const remoteUsersString = useStore(
    state => Object.values(state.users)
      .filter(u => u.id !== state.localUserId)
      .map(u => `${u.id}|${u.name}|${u.score || 0}`).join(',')
  );

  const remoteUsers = React.useMemo(() => {
    if (!remoteUsersString) return [];
    return remoteUsersString.split(',').map(data => {
      const [id, name, scoreStr] = data.split('|');
      return { id, name, score: parseInt(scoreStr, 10) };
    });
  }, [remoteUsersString]);

  const allUsers = [
    { id: localUserId, name: localUserName, score: localUserScore, isLocal: true },
    ...remoteUsers.map(u => ({ ...u, isLocal: false }))
  ].sort((a, b) => b.score - a.score);

  if (allUsers.length === 0) return null;

  return (
    <div className="absolute top-[96px] md:top-[128px] right-2 md:right-4 z-10 bg-zinc-950/80 backdrop-blur-md rounded-2xl border border-white/10 p-3 md:p-4 min-w-[160px] md:min-w-[220px] shadow-2xl">
      <h3 className="text-white text-sm font-semibold mb-4 flex items-center gap-2 border-b border-white/10 pb-2">
        <Trophy className="w-4 h-4 text-yellow-500" />
        Live Leaderboard
      </h3>
      <div className="space-y-3">
        {allUsers.slice(0, 5).map((u, i) => {
          let rankColor = "text-zinc-500";
          if (i === 0) rankColor = "text-yellow-400 font-bold";
          else if (i === 1) rankColor = "text-zinc-300 font-bold";
          else if (i === 2) rankColor = "text-amber-600 font-bold";

          return (
            <div key={u.id} className="flex justify-between items-center text-sm">
              <div className="flex items-center gap-2">
                <span className={`w-4 ${rankColor}`}>{i + 1}.</span>
                <span className={`${u.isLocal ? 'text-emerald-400 font-medium' : 'text-zinc-200'}`}>
                  {u.name}
                </span>
              </div>
              <span className={`font-mono font-bold ${u.score > 0 ? 'text-emerald-400' : 'text-zinc-500'}`}>
                {u.score}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
