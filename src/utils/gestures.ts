import { useStore } from '../store/useStore';
import { syncService } from '../services/sync';

let gestureTimeout: NodeJS.Timeout | null = null;

export const triggerLocalGesture = (gesture: string | null) => {
  const store = useStore.getState();
  
  if (gestureTimeout) {
    clearTimeout(gestureTimeout);
    gestureTimeout = null;
  }

  if (gesture === null) {
    store.setLocalUserGesture(null);
    return;
  }

  // If selecting the active gesture, toggle it off
  if (store.localUserGesture === gesture) {
    store.setLocalUserGesture(null);
    return;
  }

  store.setLocalUserGesture(gesture);

  // Broadcast message on hand gesture
  if (gesture === 'hug') {
    let targetName = "";
    const localPos = store.localUserPosition || [0, 0, 0];
    let nearestDist = 2.5;

    // Check Gemma NPC
    const npcP = store.npcPosition;
    if (npcP) {
      const dx = localPos[0] - npcP[0];
      const dy = localPos[1] - npcP[1];
      const dz = localPos[2] - npcP[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < nearestDist) {
        nearestDist = dist;
        targetName = "Gemma";
      }
    }

    // Check other users
    const users = store.users;
    Object.values(users).forEach((u) => {
      if (u.id !== store.localUserId && u.position) {
        const dx = localPos[0] - u.position[0];
        const dy = localPos[1] - u.position[1];
        const dz = localPos[2] - u.position[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < nearestDist) {
          nearestDist = dist;
          targetName = u.name || "someone";
        }
      }
    });

    if (targetName) {
      syncService.broadcastChatMessage(`😘 blew a sweet kiss to ${targetName}!`);
    } else {
      syncService.broadcastChatMessage(`😘 blew a sweet kiss to everyone!`);
    }
  }

  if (gesture === 'strut') {
    syncService.broadcastChatMessage(`💅 is strutting the catwalk! Shock and awe! ✨`);
  }

  // Set duration based on gesture type
  let duration = 3000;
  if (gesture === 'strut') duration = 15000; // Strut lasts 15 seconds
  if (gesture === 'wave') duration = 2500;
  if (gesture === 'cheer') duration = 3000;
  if (gesture === 'dance') duration = 10000; // Dance lasts longer
  if (gesture === 'hug') duration = 4000; // Hug lasts 4 seconds

  gestureTimeout = setTimeout(() => {
    useStore.getState().setLocalUserGesture(null);
  }, duration);
};
