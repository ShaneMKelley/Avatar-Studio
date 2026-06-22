import { useStore, Crystal } from '../store/useStore';
import { v4 as uuidv4 } from 'uuid';
import Peer from 'peerjs';
import { io, Socket } from 'socket.io-client';

export interface BoneSyncData {
  userId: string;
  bones: Record<string, [number, number, number, number]>;
  vowel_a: number;
  vowel_i?: number;
  vowel_o?: number;
  position: [number, number, number];
  rotation: [number, number, number];
}

const BONE_KEYS = [
  'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
  'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
  'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'rightUpperLeg', 'rightLowerLeg'
];

export function packBoneData(data: Omit<BoneSyncData, 'userId'>): Float32Array {
  const buffer = new Float32Array(81);
  buffer[0] = data.vowel_a;
  buffer[1] = data.vowel_i || 0;
  buffer[2] = data.vowel_o || 0;
  buffer[3] = data.position[0];
  buffer[4] = data.position[1];
  buffer[5] = data.position[2];
  buffer[6] = data.rotation[0];
  buffer[7] = data.rotation[1];
  buffer[8] = data.rotation[2];
  
  let offset = 9;
  for (const key of BONE_KEYS) {
    const quat = data.bones[key] || [0, 0, 0, 1];
    buffer[offset++] = quat[0];
    buffer[offset++] = quat[1];
    buffer[offset++] = quat[2];
    buffer[offset++] = quat[3];
  }
  return buffer;
}

export function unpackBoneData(userId: string, buffer: Float32Array): BoneSyncData {
  const data: BoneSyncData = {
    userId,
    vowel_a: buffer[0],
    vowel_i: buffer.length >= 81 ? buffer[1] : 0,
    vowel_o: buffer.length >= 81 ? buffer[2] : 0,
    position: [buffer[3], buffer[4], buffer[5]],
    rotation: [buffer[6], buffer[7], buffer[8]],
    bones: {}
  };
  
  let offset = 9;
  for (const key of BONE_KEYS) {
    data.bones[key] = [buffer[offset++], buffer[offset++], buffer[offset++], buffer[offset++]];
  }
  return data;
}

class SyncService {
  private peer: Peer | null = null;
  private socket: Socket | null = null;
  private connections: Map<string, any> = new Map();
  private localUserId: string;
  private lastSyncTime = 0;
  private syncInterval = 1000 / 15; // 15Hz

  public onBoneDataReceived: ((data: BoneSyncData) => void) | null = null;
  public onNpcBoneDataReceived: ((npcId: string, data: Omit<BoneSyncData, 'userId'>) => void) | null = null;

  public broadcastNpcBoneData(npcId: string, data: Omit<BoneSyncData, 'userId'>) {
    if (!this.socket) return;
    const buffer = packBoneData(data);
    this.socket.emit("npc_bone_data", { npcId, data: buffer.buffer });
  }

  constructor() {
    this.localUserId = useStore.getState().localUserId;
  }

  public async initialize() {
    // Generate a fresh UUID for this session to avoid PeerJS "ID is taken" errors
    // especially during React Strict Mode double-invocations.
    this.localUserId = uuidv4();
    useStore.getState().setLocalUserId(this.localUserId);

    // Connect to Socket.IO server using only websocket transport to avoid polling errors in production
    this.socket = io({
      transports: ['websocket'],
      upgrade: false
    });

    this.socket.on("connect", () => {
      console.log("Connected to signaling server");
      this.announcePresence();
    });

    this.socket.on("init_state", (state: { users: any[], crystals: any[], physicsProps?: any[], sequencerGrid?: boolean[][] }) => {
      const crystalsObj: Record<string, Crystal> = {};
      state.crystals.forEach(c => crystalsObj[c.id] = c);
      useStore.getState().setCrystals(crystalsObj);

      if (state.physicsProps) {
        useStore.getState().setPhysicsProps(state.physicsProps);
      }

      if (state.sequencerGrid) {
        useStore.getState().setFullSequencerGrid(state.sequencerGrid);
      }

      const currentUsers = useStore.getState().users;
      const serverUserIds = new Set(state.users.map(u => u.id));
      
      Object.keys(currentUsers).forEach(id => {
        if (id !== this.localUserId && !serverUserIds.has(id)) {
          useStore.getState().removeUser(id);
        }
      });

      state.users.forEach(u => {
        if (u.id !== this.localUserId) {
          this.handleUserJoined(u);
        }
      });
    });

    this.socket.on("user_joined", (user) => {
      if (user.id !== this.localUserId) {
        this.handleUserJoined(user);
      }
    });

    this.socket.on("user_updated", (user) => {
      if (user.id !== this.localUserId) {
        useStore.getState().updateUser(user.id, {
          name: user.name,
          score: user.score,
          vrmUrl: user.vrmUrl,
          position: user.position,
          rotation: user.rotation,
        });
      }
    });

    this.socket.on("user_left", (userId) => {
      useStore.getState().removeUser(userId);
      const conn = this.connections.get(userId);
      if (conn) {
        conn.close();
        this.connections.delete(userId);
      }
    });

    this.socket.on("crystal_spawned", (crystal) => {
      const crystals = { ...useStore.getState().crystals };
      crystals[crystal.id] = crystal;
      useStore.getState().setCrystals(crystals);
    });

    this.socket.on("prop_spawned", (prop) => {
      const props = [...useStore.getState().physicsProps];
      props.push(prop);
      useStore.getState().setPhysicsProps(props);
    });

    this.socket.on("crystal_collected", (crystalId) => {
      const crystal = useStore.getState().crystals[crystalId];
      if (crystal) {
        window.dispatchEvent(new CustomEvent('crystal-collected', { detail: { position: crystal.position } }));
        useStore.getState().removeCrystal(crystalId);
      }
    });

    this.socket.on("restore_state", (data: { score: number, vrmUrl: string }) => {
      console.log("Restoring state from server:", data);
      useStore.getState().setLocalUserScore(data.score);
      if (data.vrmUrl) {
        useStore.getState().setLocalVrmUrl(data.vrmUrl);
      }
    });

    this.socket.on("bone_data", async (payload: { userId: string, data: any }) => {
      try {
        let buffer: Float32Array | null = null;
        const data = payload.data;
        
        if (data instanceof Float32Array) {
          buffer = data;
        } else if (data instanceof ArrayBuffer) {
          buffer = new Float32Array(data);
        } else if (data.buffer && data.buffer instanceof ArrayBuffer) {
          const offset = data.byteOffset || 0;
          const length = data.byteLength || data.buffer.byteLength;
          const sliced = data.buffer.slice(offset, offset + length);
          buffer = new Float32Array(sliced);
        } else if (data instanceof Blob) {
          const arrayBuffer = await data.arrayBuffer();
          buffer = new Float32Array(arrayBuffer);
        } else if (typeof data === 'object' && data !== null) {
          const values = Object.values(data) as number[];
          if (values.length > 0) {
            buffer = new Float32Array(values);
          }
        }

        if (buffer && buffer.length >= 79) {
          const unpacked = unpackBoneData(payload.userId, buffer);
          if (this.onBoneDataReceived) {
            this.onBoneDataReceived(unpacked);
          }
          const event = new CustomEvent('vrm-bone-sync', { detail: unpacked });
          window.dispatchEvent(event);
          
          useStore.getState().updateUser(payload.userId, {
            position: unpacked.position,
            rotation: unpacked.rotation
          });
        }
      } catch (err) {
        console.error("Error processing socket bone data:", err);
      }
    });

    this.socket.on("npc_bone_data", async (payload: { npcId: string, data: any }) => {
      try {
        let buffer: Float32Array | null = null;
        const data = payload.data;
        
        if (data instanceof Float32Array) {
          buffer = data;
        } else if (data instanceof ArrayBuffer) {
          buffer = new Float32Array(data);
        } else if (data.buffer && data.buffer instanceof ArrayBuffer) {
          const offset = data.byteOffset || 0;
          const length = data.byteLength || data.buffer.byteLength;
          const sliced = data.buffer.slice(offset, offset + length);
          buffer = new Float32Array(sliced);
        } else if (data instanceof Blob) {
          const arrayBuffer = await data.arrayBuffer();
          buffer = new Float32Array(arrayBuffer);
        } else if (typeof data === 'object' && data !== null) {
          const values = Object.values(data) as number[];
          if (values.length > 0) {
            buffer = new Float32Array(values);
          }
        }

        if (buffer && buffer.length >= 79) {
          const unpacked = unpackBoneData(payload.npcId, buffer);
          if (this.onNpcBoneDataReceived) {
            this.onNpcBoneDataReceived(payload.npcId, unpacked);
          }
          const event = new CustomEvent('npc-bone-sync', { detail: unpacked });
          window.dispatchEvent(event);
        }
      } catch (err) {
        console.error("Error processing npc bone data:", err);
      }
    });

    this.socket.on("chat_message", (payload: any) => {
      if (payload && payload.type === 'chat_message') {
        // Prevent duplicate messages if received via both PeerJS and Socket.IO
        const currentMessages = useStore.getState().messages;
        if (!currentMessages.some(m => m.id === payload.payload.id)) {
          useStore.getState().addMessage(payload.payload);
        }
      }
    });

    this.socket.on("npc_model_changed", (payload: { npcId: string, vrmUrl: string }) => {
      const event = new CustomEvent('gemma-model-sync', { detail: payload });
      window.dispatchEvent(event);
    });

    this.socket.on("sequencer_update", (payload: { track: number, step: number, value: boolean }) => {
      useStore.getState().updateSequencerGrid(payload.track, payload.step, payload.value);
    });

    // Initialize PeerJS with debug: 0 to suppress internal PeerJS library console.errors
    // We also monkeypatch console.error to filter out PeerJS network connection reports
    if (typeof window !== 'undefined' && !(window as any).__peerjsConsoleWrapped) {
      (window as any).__peerjsConsoleWrapped = true;
      const originalError = console.error;
      console.error = function (...args: any[]) {
        const msg = args.map(arg => {
          if (arg && typeof arg === 'object') {
            return arg.message || arg.type || String(arg);
          }
          return String(arg);
        }).join(' ');
        if (
          msg.includes('PeerJS:') || 
          msg.includes('Could not connect to peer') || 
          msg.includes('peer-unavailable') ||
          msg.includes('Error: Could not connect to peer')
        ) {
          console.warn('[Bypassed PeerJS Console Error]', ...args);
          return;
        }
        originalError.apply(console, args);
      };
    }

    this.peer = new Peer(this.localUserId, { debug: 0 });

    this.peer.on('open', (id) => {
      console.log('My peer ID is: ' + id);
    });

    this.peer.on('disconnected', () => {
      console.log('PeerJS disconnected. Reconnecting...');
      if (this.peer && !this.peer.destroyed) {
        this.peer.reconnect();
      }
    });

    this.peer.on('error', (err: any) => {
      if (err.type === 'peer-unavailable' || err.type === 'network' || err.type === 'webrtc' || err.type === 'server-error' || err.message?.includes('Could not connect to peer') || err.message?.includes('Lost connection to server')) {
        console.warn('PeerJS non-fatal error:', err.type, err.message);
        // We have Socket.IO fallback, so we can ignore these WebRTC connection issues
        return;
      }
      console.warn('PeerJS error:', err);
      if (err.type === 'unavailable-id') {
        console.log('ID taken, generating new one...');
        this.cleanup();
        this.initialize();
      }
    });

    this.peer.on('connection', (conn) => {
      this.setupConnection(conn);
    });

    this.peer.on('call', (call) => {
      const stream = useStore.getState().micStream;
      if (stream) {
        call.answer(stream);
      } else {
        call.answer();
      }
      
      call.on('error', (err: any) => {
        console.warn('PeerJS incoming call non-fatal error:', err);
      });

      call.on('stream', (remoteStream) => {
        useStore.getState().updateUser(call.peer, { stream: remoteStream });
      });
    });

    window.addEventListener('beforeunload', () => {
      this.cleanup();
    });
  }

  private handleUserJoined(user: any) {
    useStore.getState().updateUser(user.id, {
      name: user.name || `User-${user.id.slice(0, 4)}`,
      score: user.score || 0,
      vrmUrl: user.vrmUrl,
      position: user.position,
      rotation: user.rotation,
    });

    if (this.peer && !this.connections.has(user.id)) {
      const conn = this.peer.connect(user.id);
      this.setupConnection(conn);

      const stream = useStore.getState().micStream;
      if (stream) {
        const call = this.peer.call(user.id, stream);
        if (call) {
          call.on('error', (err: any) => {
            console.warn('PeerJS call non-fatal error:', err);
          });
          call.on('stream', (remoteStream) => {
            useStore.getState().updateUser(user.id, { stream: remoteStream });
          });
        }
      }
    }
  }

  private setupConnection(conn: any) {
    conn.on('error', (err: any) => {
      console.warn('PeerJS connection non-fatal error:', err);
    });

    conn.on('data', async (data: any) => {
      try {
        let buffer: Float32Array | null = null;
        
        if (data instanceof Float32Array) {
          buffer = data;
        } else if (data instanceof ArrayBuffer) {
          buffer = new Float32Array(data);
        } else if (data.buffer && data.buffer instanceof ArrayBuffer) {
          const offset = data.byteOffset || 0;
          const length = data.byteLength || data.buffer.byteLength;
          const sliced = data.buffer.slice(offset, offset + length);
          buffer = new Float32Array(sliced);
        } else if (data instanceof Blob) {
          const arrayBuffer = await data.arrayBuffer();
          buffer = new Float32Array(arrayBuffer);
        } else if (data && data.type === 'chat_message') {
          const currentMessages = useStore.getState().messages;
          if (!currentMessages.some(m => m.id === data.payload.id)) {
            useStore.getState().addMessage(data.payload);
          }
          return;
        } else if (typeof data === 'object' && data !== null && !data.type) {
          // Fallback for when Float32Array is serialized as a plain object
          const keys = Object.keys(data);
          if (keys.length >= 79 && !isNaN(Number(keys[0]))) {
            buffer = new Float32Array(79);
            for (let i = 0; i < 79; i++) {
              buffer[i] = data[i] || 0;
            }
          } else {
            console.warn("Unknown data type received:", typeof data, data);
          }
        } else {
          console.warn("Unknown data type received:", typeof data, data);
        }

        if (buffer && buffer.length >= 79) {
          const unpacked = unpackBoneData(conn.peer, buffer);
          
          if (this.onBoneDataReceived) {
            this.onBoneDataReceived(unpacked);
          }
          const event = new CustomEvent('vrm-bone-sync', { detail: unpacked });
          window.dispatchEvent(event);
          
          useStore.getState().updateUser(conn.peer, {
            position: unpacked.position,
            rotation: unpacked.rotation
          });
          return;
        }
      } catch (err) {
        console.error("Error processing sync data:", err);
      }
    });

    conn.on('close', () => {
      this.connections.delete(conn.peer);
      // Auto-reconnect if they are still listed in our users list in useStore
      const activeUsers = useStore.getState().users;
      if (activeUsers[conn.peer] && this.peer && !this.peer.destroyed) {
        console.log(`[Multiplayer Link] Connection closed with peer ${conn.peer}. Attempting dynamic recovery...`);
        setTimeout(() => {
          const currentUsers = useStore.getState().users;
          if (currentUsers[conn.peer] && this.peer && !this.peer.destroyed && !this.connections.has(conn.peer)) {
            const newConn = this.peer.connect(conn.peer);
            this.setupConnection(newConn);
          }
        }, 1500); // 1.5s delay to prevent connection thrashing
      }
    });

    this.connections.set(conn.peer, conn);
  }

  private announcePresence() {
    if (!this.socket) return;
    const state = useStore.getState();
    this.socket.emit("join", {
      id: this.localUserId,
      name: state.localUserName,
      score: state.localUserScore,
      vrmUrl: state.vrmUrl,
      position: state.localUserPosition || [0, 0, 0],
      rotation: state.localUserRotation || [0, 0, 0],
      roomId: state.currentRoom
    });
  }

  public changeRoom(roomId: string) {
    if (!this.socket) return;
    useStore.getState().setCurrentRoom(roomId);
    
    // Disconnect all current peer connections since we only want to talk to people in the new room
    for (const [id, conn] of this.connections.entries()) {
      conn.close();
      this.connections.delete(id);
    }
    
    this.socket.emit("join_room", roomId);
  }

  public updatePresenceName(name: string) {
    if (!this.socket) return;
    this.socket.emit("update_presence", { name });
  }

  public updatePresenceVrmUrl(url: string) {
    if (!this.socket) return;
    this.socket.emit("update_presence", { vrmUrl: url });
  }

  public updatePresenceScore(score: number) {
    if (!this.socket) return;
    this.socket.emit("update_presence", { score });
  }

  public spawnCrystal(crystalData: any) {
    if (this.socket) {
      this.socket.emit("spawn_crystal", crystalData);
    }
  }

  public spawnProp(propData: any) {
    if (this.socket) {
      this.socket.emit("spawn_prop", propData);
    }
  }

  public collectCrystal(id: string) {
    if (!this.socket) return;
    const state = useStore.getState();
    const crystal = state.crystals[id];
    if (!crystal) return;
    
    window.dispatchEvent(new CustomEvent('crystal-collected', { detail: { position: crystal.position } }));
    useStore.getState().removeCrystal(id);
    const newScore = state.localUserScore + 1;
    useStore.getState().setLocalUserScore(newScore);
    
    this.socket.emit("collect_crystal", id);
  }

  public async uploadVrm(file: File, onProgress?: (progress: number) => void): Promise<string | null> {
    try {
      const formData = new FormData();
      formData.append('vrm', file);

      // Simulate progress since fetch doesn't support upload progress easily
      if (onProgress) {
        let p = 0;
        const interval = setInterval(() => {
          p += 10;
          if (p <= 90) onProgress(p);
        }, 100);
        setTimeout(() => clearInterval(interval), 1000);
      }

      const response = await fetch('/api/upload-vrm', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      if (onProgress) onProgress(100);
      
      this.updatePresenceVrmUrl(data.url);
      return data.url;
    } catch (error) {
      console.error("Error uploading VRM:", error);
      return null;
    }
  }

  public broadcastBoneData(data: Omit<BoneSyncData, 'userId'>) {
    const now = performance.now();
    if (now - this.lastSyncTime < this.syncInterval) return;
    this.lastSyncTime = now;

    const buffer = packBoneData(data);

    let sentViaPeer = false;
    this.connections.forEach(conn => {
      if (conn.open) {
        conn.send(buffer.buffer);
        sentViaPeer = true;
      }
    });

    // Fallback to socket.io if peer connections aren't open or as a reliable backup
    if (this.socket) {
      this.socket.emit("bone_data", buffer.buffer);
    }
  }

  public broadcastChatMessage(text: string) {
    const state = useStore.getState();
    const message = {
      id: uuidv4(),
      senderId: this.localUserId,
      senderName: state.localUserName,
      text,
      timestamp: Date.now()
    };

    useStore.getState().addMessage(message);

    const payload = {
      type: 'chat_message',
      payload: message
    };

    this.connections.forEach(conn => {
      if (conn.open) {
        conn.send(payload);
      }
    });

    if (this.socket) {
      this.socket.emit("chat_message", payload);
    }
  }

  public broadcastNpcMessage(name: string, text: string) {
    const message = {
      id: uuidv4(),
      senderId: `npc-${name.toLowerCase()}`,
      senderName: name,
      text,
      timestamp: Date.now()
    };

    useStore.getState().addMessage(message);

    const payload = {
      type: 'chat_message',
      payload: message
    };

    this.connections.forEach(conn => {
      if (conn.open) {
        conn.send(payload);
      }
    });

    if (this.socket) {
      this.socket.emit("chat_message", payload);
    }
  }

  public broadcastSequencerUpdate(track: number, step: number, value: boolean) {
    if (this.socket) {
      this.socket.emit("sequencer_update", { track, step, value });
    }
  }

  public broadcastNpcModelChanged(vrmUrl: string) {
    if (this.socket) {
      this.socket.emit("npc_model_changed", { npcId: "gemma", vrmUrl });
    }
  }

  public broadcastNpcModifyScore(targetUserName: string, pointsChange: number, reason: string) {
    if (this.socket) {
      this.socket.emit("npc_modify_score", { targetUserName, pointsChange, reason });
    }
  }

  public cleanup() {
    if (this.socket) this.socket.disconnect();
    if (this.peer) this.peer.destroy();
  }
}

export const syncService = new SyncService();
