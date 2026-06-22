import React from 'react';
import { Users } from 'lucide-react';
import { useStore } from '../store/useStore';

export const UserCount: React.FC = () => {
  const users = useStore(state => state.users);
  
  // Total count is remote users + 1 (the local user)
  const count = Object.keys(users).length + 1;

  return (
    <div className="absolute top-4 right-4 z-10 bg-zinc-900/40 backdrop-blur-sm border border-white/10 rounded-full px-4 py-2 flex items-center gap-2 text-white shadow-xl transition-all">
      <Users className="w-4 h-4 text-emerald-400" />
      <span className="text-sm font-medium">
        {count} {count === 1 ? 'User' : 'Users'} Online
      </span>
    </div>
  );
};
