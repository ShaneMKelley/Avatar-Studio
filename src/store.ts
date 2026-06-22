/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { create } from 'zustand';
import * as THREE from 'three';
import { io, Socket } from 'socket.io-client';
import { useStore } from './store/useStore';
import { syncService } from './services/sync';
import { soundManager } from './utils/soundManager';

export type GameState = 'menu' | 'playing' | 'gameover';
export type EntityState = 'active' | 'disabled';

export interface EnemyData {
  id: string;
  position: [number, number, number];
  state: EntityState;
  disabledUntil: number;
  hasDodged?: boolean;
  dodgeTime?: number;
  type?: string;
  health?: number;
  maxHealth?: number;
  legShotTime?: number;
}

export interface PlayerData {
  id: string;
  name: string;
  position: [number, number, number];
  rotation: number;
  state: EntityState;
  disabledUntil: number;
  score: number;
  color: string;
  vrmUrl?: string;
}

export interface LaserData {
  id: string;
  start: [number, number, number];
  end: [number, number, number];
  timestamp: number;
  color: string;
}

export interface ParticleData {
  id: string;
  position: [number, number, number];
  timestamp: number;
  color: string;
}

export interface GameEvent {
  id: string;
  message: string;
  timestamp: number;
}

export interface MatchLog {
  id: string;
  type: 'first-blood' | 'multi-kill' | 'streak' | 'general';
  message: string;
  timestamp: number;
}

export interface DamageText {
  id: string;
  text: string;
  position: [number, number, number];
  timestamp: number;
  color: string;
  isCritical: boolean;
}

interface GameStore {
  gameState: GameState;
  score: number;
  timeLeft: number;
  playerState: EntityState;
  playerDisabledUntil: number;
  playerHealth: number;
  enemies: EnemyData[];
  lasers: LaserData[];
  particles: ParticleData[];
  events: GameEvent[];
  
  // Tactical Tickers & Logs
  matchLogs: MatchLog[];
  firstBloodTriggered: boolean;
  survivorStreak: number;
  multiKillCount: number;
  lastDefeatTime: number;
  addMatchLog: (type: MatchLog['type'], message: string) => void;

  // Floating Damage Indicators
  damageTexts: DamageText[];
  addDamageText: (text: string, position: [number, number, number], isCritical: boolean, color: string) => void;

  // Tactical Dash Ability State
  dashCooldown: number; // in ms
  dashMaxCooldown: number; // in ms
  
  // Multiplayer
  socket: Socket | null;
  otherPlayers: Record<string, PlayerData>;

  startGame: () => void;
  endGame: () => void;
  leaveGame: () => void;
  updateTime: (delta: number) => void;
  hitPlayer: (damage?: number) => void;
  healPlayer: (amount: number) => void;
  hitEnemy: (id: string, byPlayer?: boolean, damage?: number, damageTypeMsg?: string) => void;
  addLaser: (start: [number, number, number], end: [number, number, number], color: string) => void;
  addParticles: (position: [number, number, number], color: string) => void;
  addEvent: (message: string) => void;
  updateEnemies: (time: number) => void;
  cleanupEffects: (time: number) => void;
  setPlayerState: (state: EntityState) => void;
  
  // Custom Knockback Abilities for Heavy Enemies
  playerKnockback: [number, number, number] | null;
  applyKnockback: (force: [number, number, number]) => void;
  clearKnockback: () => void;
  
  // Player Position tracking for safe zone rules
  playerPosition: [number, number, number] | null;
  
  // Multiplayer actions
  updatePlayerPosition: (position: [number, number, number], rotation: number) => void;

  // Mobile Controls
  mobileInput: {
    move: { x: number, y: number };
    look: { x: number, y: number };
    shooting: boolean;
    crouching: boolean;
  };
  setMobileInput: (input: Partial<{
    move: { x: number, y: number };
    look: { x: number, y: number };
    shooting: boolean;
    crouching: boolean;
  }>) => void;

  // Leroy Jenkins room mechanics
  leroyChargeActiveUntil: number;
  activateLeroyCharge: () => void;
}

const INITIAL_ENEMIES: EnemyData[] = [
  { id: 'bot-1', position: [40, 1, 40], state: 'active', disabledUntil: 0 },
  { id: 'bot-2', position: [-40, 1, 40], state: 'active', disabledUntil: 0 },
  { id: 'bot-3', position: [40, 1, -40], state: 'active', disabledUntil: 0 },
  { id: 'bot-4', position: [-40, 1, -40], state: 'active', disabledUntil: 0 },
  { id: 'bot-5', position: [0, 1, -50], state: 'active', disabledUntil: 0 },
  { id: 'bot-6', position: [60, 1, 0], state: 'active', disabledUntil: 0 },
  { id: 'bot-7', position: [-60, 1, 0], state: 'active', disabledUntil: 0 },
  { id: 'bot-8', position: [0, 1, 50], state: 'active', disabledUntil: 0 },
  { id: 'bot-9', position: [20, 1, 60], state: 'active', disabledUntil: 0 },
  { id: 'bot-10', position: [-20, 1, -60], state: 'active', disabledUntil: 0 },
  { id: 'bot-11', position: [70, 1, 70], state: 'active', disabledUntil: 0 },
  { id: 'bot-12', position: [-70, 1, -70], state: 'active', disabledUntil: 0 },
  { id: 'bot-13', position: [50, 1, -25], state: 'active', disabledUntil: 0 },
  { id: 'bot-14', position: [-50, 1, 25], state: 'active', disabledUntil: 0 },
  { id: 'bot-15', position: [-30, 1, -30], state: 'active', disabledUntil: 0 },
  { id: 'bot-16', position: [30, 1, 30], state: 'active', disabledUntil: 0 },
  { id: 'bot-17', position: [0, 1, 80], state: 'active', disabledUntil: 0 },
  { id: 'bot-18', position: [-80, 1, 10], state: 'active', disabledUntil: 0 },
  { id: 'bot-19', position: [80, 1, -10], state: 'active', disabledUntil: 0 },
  { id: 'bot-20', position: [-15, 1, 45], state: 'active', disabledUntil: 0 },
  { id: 'bot-21', position: [15, 1, -45], state: 'active', disabledUntil: 0 },
  { id: 'bot-22', position: [-55, 1, 55], state: 'active', disabledUntil: 0 },
  { id: 'bot-23', position: [55, 1, -55], state: 'active', disabledUntil: 0 },
  { id: 'bot-24', position: [30, 1, -75], state: 'active', disabledUntil: 0 },
  { id: 'bot-25', position: [-30, 1, 75], state: 'active', disabledUntil: 0 },
  { id: 'bot-26', position: [0, 1, -85], state: 'active', disabledUntil: 0 },
];

const createEnemiesList = (): EnemyData[] => {
  const list: EnemyData[] = [];
  INITIAL_ENEMIES.forEach((e, idx) => {
    const mod = idx % 5;
    const type = mod === 1 ? 'infiltrator' : mod === 2 ? 'bombardier' : mod === 3 ? 'overseer' : mod === 4 ? 'drone_operator' : 'sentinel';
    const max_hp = mod === 1 ? 3.6 : mod === 2 ? 9.0 : mod === 3 ? 6.0 : mod === 4 ? 4.8 : 6.0;
    
    list.push({
      ...e,
      type,
      state: 'active' as EntityState,
      disabledUntil: 0,
      health: max_hp,
      maxHealth: max_hp,
      legShotTime: 0
    });
    
    if (type === 'drone_operator') {
      list.push({
        id: `${e.id}-drone`,
        position: [e.position[0] + 1.5, e.position[1] + 3.5, e.position[2] + 1.5] as [number, number, number],
        state: 'active' as EntityState,
        disabledUntil: 0,
        type: 'support_drone',
        health: 2.4,
        maxHealth: 2.4,
        legShotTime: 0
      });
    }
  });
  return list;
};

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: 'menu',
  score: 0,
  timeLeft: 0, // elapsed time starting at 0
  playerState: 'active',
  playerDisabledUntil: 0,
  playerHealth: 100,
  enemies: [],
  lasers: [],
  particles: [],
  events: [],
  playerKnockback: null,
  applyKnockback: (force) => set({ playerKnockback: force }),
  clearKnockback: () => set({ playerKnockback: null }),
  playerPosition: null,

  // Initializing new tactical states
  matchLogs: [],
  firstBloodTriggered: false,
  survivorStreak: 0,
  multiKillCount: 0,
  lastDefeatTime: 0,
  addMatchLog: (type, message) => set((state) => ({
    matchLogs: [...state.matchLogs, { id: Math.random().toString(), type, message, timestamp: Date.now() }].slice(-24)
  })),

  damageTexts: [],
  addDamageText: (text, position, isCritical, color) => set((state) => ({
    damageTexts: [...(state.damageTexts || []), { id: Math.random().toString(), text, position, isCritical, color, timestamp: Date.now() }].slice(-39)
  })),

  dashCooldown: 0,
  dashMaxCooldown: 3000,
  
  socket: null,
  otherPlayers: {},

  mobileInput: {
    move: { x: 0, y: 0 },
    look: { x: 0, y: 0 },
    shooting: false,
    crouching: false
  },

  setMobileInput: (input) => set((state) => ({
    mobileInput: { ...state.mobileInput, ...input }
  })),

  leroyChargeActiveUntil: 0,
  activateLeroyCharge: () => {
    soundManager.playLeroyCharge();
    const now = Date.now();
    const { socket } = get();
    if (socket) {
      socket.emit('leroyCharge');
    }
    set(state => ({
      leroyChargeActiveUntil: now + 6000,
      events: [
        ...state.events,
        {
          id: Math.random().toString(),
          message: `🔥 LEROYYYYYY JENKINS!!! Group charge protocol activated! (+50% Speed Buff!)`,
          timestamp: now
        }
      ]
    }));
  },

  startGame: () => {
    const { socket } = get();
    
    if (socket) {
      socket.disconnect();
    }

    let newSocket: Socket | null = null;

    // Initialize multiplayer using only websocket transport to bypass polling in production
    newSocket = io({
      transports: ['websocket'],
      upgrade: false
    });
    
    newSocket.on('connect', () => {
      const vrmUrl = useStore.getState().vrmUrl;
      newSocket!.emit('joinGame', { vrmUrl });
    });

    newSocket.on('gameError', (msg: string) => {
      console.error('[Arena Game Error]', msg);
      get().leaveGame();
    });

    newSocket.on('gameJoined', (players: Record<string, PlayerData>) => {
      const otherPlayers = { ...players };
      delete otherPlayers[newSocket!.id!];
      set({ 
        otherPlayers,
        gameState: 'playing',
        timeLeft: 0,
        score: 0,
        playerHealth: 100,
        enemies: createEnemiesList(),
        matchLogs: [],
        firstBloodTriggered: false,
        survivorStreak: 0,
        multiKillCount: 0,
        lastDefeatTime: 0,
        damageTexts: [],
        dashCooldown: 0
      });
    });

      newSocket.on('playerJoined', (player: PlayerData) => {
        set(state => ({
          otherPlayers: { ...state.otherPlayers, [player.id]: player },
          events: [...state.events, { id: Math.random().toString(), message: `${player.name} joined`, timestamp: Date.now() }]
        }));
      });

      newSocket.on('playerMoved', (data: { id: string, position: [number, number, number], rotation: number }) => {
        set(state => {
          if (!state.otherPlayers[data.id]) return state;
          return {
            otherPlayers: {
              ...state.otherPlayers,
              [data.id]: {
                ...state.otherPlayers[data.id],
                position: data.position,
                rotation: data.rotation
              }
            }
          };
        });
      });

      newSocket.on('playerShot', (data: { id: string, start: [number, number, number], end: [number, number, number], color: string }) => {
        set(state => ({
          lasers: [...state.lasers, { id: Math.random().toString(36).substr(2, 9), start: data.start, end: data.end, timestamp: Date.now(), color: data.color }],
          particles: [...state.particles, { id: Math.random().toString(36).substr(2, 9), position: data.end, timestamp: Date.now(), color: data.color }]
        }));
      });

      newSocket.on('playerLeroyCharge', (data: { id: string }) => {
        soundManager.playLeroyCharge();
        const now = Date.now();
        set(state => {
          const playerName = state.otherPlayers[data.id]?.name || 'An ally';
          return {
            leroyChargeActiveUntil: now + 6000,
            events: [
              ...state.events,
              {
                id: Math.random().toString(),
                message: `🔥 LEROYYYYYY JENKINS!!! Activated by ${playerName}! (+50% Speed Buff!)`,
                timestamp: now
              }
            ]
          };
        });
      });

      newSocket.on('playerHit', (data: { targetId: string, shooterId: string, targetDisabledUntil: number, shooterScore: number }) => {
        set(state => {
          const now = Date.now();
          const isLocalShooter = data.shooterId === newSocket!.id;
          const isLocalTarget = data.targetId === newSocket!.id;
          
          const shooterName = isLocalShooter ? 'You' : (state.otherPlayers[data.shooterId]?.name || 'Unknown');
          const targetName = isLocalTarget ? 'You' : (state.otherPlayers[data.targetId]?.name || 'Unknown');
          const eventMsg = `${shooterName} tagged ${targetName}`;
          const newEvent = { id: Math.random().toString(), message: eventMsg, timestamp: now };

          let newState: Partial<GameStore> = {
            events: [...state.events, newEvent]
          };

          if (isLocalTarget) {
            newState.playerState = 'disabled';
            newState.playerDisabledUntil = data.targetDisabledUntil;
          }

          if (isLocalShooter) {
            newState.score = data.shooterScore;
          }

          // Update other players' states
          const players = { ...state.otherPlayers };
          let playersChanged = false;

          if (!isLocalTarget && players[data.targetId]) {
            players[data.targetId] = {
              ...players[data.targetId],
              state: 'disabled',
              disabledUntil: data.targetDisabledUntil
            };
            playersChanged = true;
          }

          if (!isLocalShooter && players[data.shooterId]) {
            players[data.shooterId] = {
              ...players[data.shooterId],
              score: data.shooterScore
            };
            playersChanged = true;
          }

          if (playersChanged) {
            newState.otherPlayers = players;
          }

          return newState;
        });
      });

      newSocket.on('playerLeft', (id: string) => {
        set(state => {
          const players = { ...state.otherPlayers };
          const playerName = players[id]?.name || 'Unknown';
          delete players[id];
          return { 
            otherPlayers: players,
            events: [...state.events, { id: Math.random().toString(), message: `${playerName} left`, timestamp: Date.now() }]
          };
        });
      });
    set({
      gameState: 'playing',
      score: 0,
      timeLeft: 0,
      playerState: 'active',
      playerDisabledUntil: 0,
      playerHealth: 100,
      enemies: createEnemiesList(),
      lasers: [],
      particles: [],
      events: [],
      socket: newSocket,
      otherPlayers: {},
      matchLogs: [],
      firstBloodTriggered: false,
      survivorStreak: 0,
      multiKillCount: 0,
      lastDefeatTime: 0,
      damageTexts: [],
      dashCooldown: 0
    });
  },

  endGame: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
    }
    set({ gameState: 'gameover', socket: null });
  },

  leaveGame: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
    }
    // Explicitly release pointer lock to make sure mouse returns
    if (typeof document !== 'undefined') {
      try {
        if (document.pointerLockElement) {
          document.exitPointerLock();
        }
      } catch (e) {
        console.warn("Could not exit pointer lock", e);
      }
    }
    set({
      gameState: 'menu',
      socket: null,
      otherPlayers: {},
      enemies: [],
      lasers: [],
      particles: [],
      events: [],
      score: 0,
      timeLeft: 0,
      playerState: 'active',
      playerHealth: 100,
      matchLogs: [],
      firstBloodTriggered: false,
      survivorStreak: 0,
      multiKillCount: 0,
      lastDefeatTime: 0,
      damageTexts: [],
      dashCooldown: 0
    });
  },

  updateTime: (delta) => set((state) => {
    if (state.gameState !== 'playing') return state;
    const newTime = state.timeLeft + delta;
    const newCooldown = Math.max(0, (state.dashCooldown || 0) - delta * 1000);
    return { timeLeft: newTime, dashCooldown: newCooldown };
  }),

  hitPlayer: (damage = 20) => set((state) => {
    if (state.playerState === 'disabled' || state.gameState !== 'playing') return state;
    
    // Check if player is inside the Leroy Jenkins Room safe zone (spawn center at [0,0,0], radius 10.5m)
    if (state.playerPosition) {
      const pos = state.playerPosition;
      const horizontalDist = Math.sqrt(pos[0] * pos[0] + pos[2] * pos[2]);
      if (horizontalDist < 10.5) {
        // Safe Zone! Block all damage, stun, scoring penalty, and hit sounds
        return state;
      }
    }
    
    soundManager.playPlayerHit();
 
    const currentHp = state.playerHealth !== undefined ? state.playerHealth : 100;
    const newHealth = Math.max(0, currentHp - damage);

    // Update main lobby leaderboard score with player penalty
    const mainScore = useStore.getState().localUserScore;
    const newMainScore = Math.max(0, mainScore - 20);
    useStore.getState().setLocalUserScore(newMainScore);
    syncService.updatePresenceScore(newMainScore);

    if (newHealth <= 0) {
      // Return player to safe/save room (chill lounge) immediately
      setTimeout(() => {
        get().leaveGame();
        useStore.getState().setCurrentRoom('lounge');
        syncService.changeRoom('lounge');
      }, 50);

      return {
        playerHealth: 100,
        score: Math.max(0, state.score - 100),
        survivorStreak: 0,
        events: [...state.events, { id: Math.random().toString(), message: `❌ SYSTEM FAILURE: Player neutralized! Vitals reached zero!`, timestamp: Date.now() }]
      };
    }

    return {
      playerHealth: newHealth,
      playerState: 'disabled',
      playerDisabledUntil: Date.now() + 1000, // 1s cooldown invulnerability
      score: Math.max(0, state.score - 20),
      survivorStreak: 0,
      events: [...state.events, { id: Math.random().toString(), message: `💥 DAMAGE TAKEN: Took -${damage} HP from enemy fire! Vitals at ${newHealth}%`, timestamp: Date.now() }]
    };
  }),

  healPlayer: (amount) => set((state) => {
    if (state.gameState !== 'playing') return state;
    const currentHp = state.playerHealth !== undefined ? state.playerHealth : 100;
    if (currentHp >= 100) return state;
    const newHealth = Math.min(100, currentHp + amount);
    return {
      playerHealth: newHealth,
      events: [...state.events, { id: Math.random().toString(), message: `💚 RECOVERY: Autonomic nanites restored +${amount} HP! (Vitals at ${newHealth}%)`, timestamp: Date.now() }]
    };
  }),

  hitEnemy: (id, byPlayer = false, damage = 1.0, damageTypeMsg = '') => set((state) => {
    if (state.gameState !== 'playing') return state;
    if (!byPlayer && id.startsWith('bot-')) return state;
    
    // Check if it's a multiplayer player
    if (state.socket && state.otherPlayers[id]) {
      state.socket.emit('hitPlayer', id);
      return state;
    }

    const targetEnemy = state.enemies.find(e => e.id === id);
    const isInf = targetEnemy?.type === 'infiltrator';
    const isBomb = targetEnemy?.type === 'bombardier';
    const isOver = targetEnemy?.type === 'overseer';
    const isOp = targetEnemy?.type === 'drone_operator';
    const isDrone = targetEnemy?.type === 'support_drone';
    const enemyTypeName = isInf ? 'Infiltrator' : isBomb ? 'Bombardier' : isOver ? 'Overseer' : isOp ? 'Drone Operator' : isDrone ? 'Support Drone' : 'Sentinel';

    let enemyDefeated = false;
    let actualDamage = damage;
    const isWeakpointHit = isBomb && damageTypeMsg === 'ROCKET POD WEAKPOINT';
    const isOverWeakpointHit = isOver && damageTypeMsg === 'MULTI-LENSED HELMET';

    if (isWeakpointHit || isOverWeakpointHit) {
      actualDamage = 99.0; // Instantly neutralize on direct weak point malfunction
    }
    
    let enemies = state.enemies.map(e => {
      if (e.id === id && e.state === 'active') {
        const d_isInf = e.type === 'infiltrator';
        const d_isBomb = e.type === 'bombardier';
        const d_isOver = e.type === 'overseer';
        const d_isOp = e.type === 'drone_operator';
        const d_isDrone = e.type === 'support_drone';
        const maxHp = e.maxHealth ?? (d_isInf ? 3.6 : d_isBomb ? 9.0 : d_isOver ? 6.0 : d_isOp ? 4.8 : d_isDrone ? 2.4 : 6.0);
        const curHp = e.health ?? maxHp;
        const newHp = Math.max(0, curHp - actualDamage);
        
        if (newHp <= 0) {
          enemyDefeated = true;
          return {
            ...e,
            state: 'disabled' as EntityState,
            disabledUntil: Date.now() + 5000, // 5s respawn cooldown
            health: maxHp, // reset health for respawn
            legShotTime: 0,
          };
        } else {
          return {
            ...e,
            health: newHp,
            dodgeTime: Date.now(), // visually flash and stagger on any hit!
            legShotTime: damageTypeMsg?.includes('LEG') ? Date.now() : e.legShotTime,
          };
        }
      }
      return e;
    });

    let extraScore = enemyDefeated ? 300 : 25;
    const rawMaxHp = targetEnemy?.maxHealth ?? (isInf ? 3.6 : isBomb ? 9.0 : isOver ? 6.0 : isOp ? 4.8 : isDrone ? 2.4 : 6.0);
    
    let hitMessage = '';
    if (enemyDefeated) {
      if (isWeakpointHit) {
        hitMessage = `💥 CRITICAL CORE BREAKPOINT on Bombardier ${id.replace('bot-', '#')}! (+300 pts)`;
      } else if (isOverWeakpointHit) {
        hitMessage = `💥 PRECISION CRITICAL COLLAPSE on Overseer ${id.replace('bot-', '#')} Headpiece! (+300 pts)`;
      } else {
        hitMessage = `💥 ${enemyTypeName} ${id.replace('bot-', '#')} Neutralized! (+300 pts)`;
      }
    } else {
      const remainingHpMsg = enemies.find(e => e.id === id)?.health?.toFixed(1) || '0';
      const typeLabel = damageTypeMsg ? `${damageTypeMsg}` : 'HIT';
      hitMessage = `🎯 ${typeLabel} on ${enemyTypeName} ${id.replace('bot-', '#')}! [HP: ${remainingHpMsg}/${rawMaxHp.toFixed(1)}]`;
    }

    let blastEvents: GameEvent[] = [];
    if (enemyDefeated && isWeakpointHit) {
      const bombPos = targetEnemy ? new THREE.Vector3(...targetEnemy.position) : new THREE.Vector3();
      soundManager.playBombardierExplosion();

      enemies = enemies.map(e => {
        if (e.id !== id && e.state === 'active') {
          const ep = new THREE.Vector3(...e.position);
          const dist = bombPos.distanceTo(ep);
          if (dist < 22.0) {
            const e_isInf = e.type === 'infiltrator';
            const e_isBomb = e.type === 'bombardier';
            const e_isOver = e.type === 'overseer';
            const maxHp = e.maxHealth ?? (e_isInf ? 3.6 : e_isBomb ? 9.0 : e_isOver ? 6.0 : 6.0);
            const curHp = e.health ?? maxHp;
            const newHp = Math.max(0, curHp - 5.0); // Deal 5.0 blast damage to nearby bots
            
            if (newHp <= 0) {
              const r_name = e.type === 'infiltrator' ? 'Infiltrator' : e.type === 'bombardier' ? 'Bombardier' : e.type === 'overseer' ? 'Overseer' : 'Sentinel';
              blastEvents.push({
                id: Math.random().toString(),
                message: `💥 Nearby ${r_name} ${e.id.replace('bot-', '#')} vaporized by Blast Wave (+300 pts)`,
                timestamp: Date.now()
              });
              
              if (byPlayer) {
                extraScore += 300;
              }

              return {
                ...e,
                state: 'disabled' as EntityState,
                disabledUntil: Date.now() + 5000,
                health: maxHp,
                legShotTime: 0
              };
            } else {
              return {
                ...e,
                health: newHp,
                dodgeTime: Date.now()
              };
            }
          }
        }
        return e;
      });
    }

    if (enemyDefeated && isOver) {
      const overPos = targetEnemy ? new THREE.Vector3(...targetEnemy.position) : new THREE.Vector3();
      enemies = enemies.map(e => {
        if (e.id !== id && e.state === 'active') {
          const ep = new THREE.Vector3(...e.position);
          const dist = overPos.distanceTo(ep);
          if (dist < 35.0) {
            return {
              ...e,
              dodgeTime: Date.now() // visually stagger and stun surrounding squad
            };
          }
        }
        return e;
      });
      blastEvents.push({
        id: Math.random().toString(),
        message: `📡 OVERSEER COMMAND SIGNAL LOST: Squad staggered in confusion!`,
        timestamp: Date.now()
      });
    }

    let companionEvents: GameEvent[] = [];
    if (enemyDefeated && isDrone) {
      const opId = id.replace('-drone', '');
      enemies = enemies.map(e => {
        if (e.id === opId && e.state === 'active') {
          const mhp = e.maxHealth ?? 4.8;
          const curhp = e.health ?? mhp;
          const targetHp = Math.max(0.5, curhp - 2.5);
          companionEvents.push({
            id: Math.random().toString(),
            message: `⚡ SUPPORT DRONE DOWN: Operator tablet short-circuited! Operator stunned!`,
            timestamp: Date.now()
          });
          return {
            ...e,
            health: targetHp,
            dodgeTime: Date.now() + 4000, // 4-second heavy stun
          };
        }
        return e;
      });
    }

    if (enemyDefeated && isOp) {
      const droneId = `${id}-drone`;
      enemies = enemies.map(e => {
        if (e.id === droneId && e.state === 'active') {
          companionEvents.push({
            id: Math.random().toString(),
            message: `📡 OPERATOR SHOT DOWN: Support Drone signal crashed!`,
            timestamp: Date.now()
          });
          return {
            ...e,
            state: 'disabled' as EntityState,
            disabledUntil: Date.now() + 5000,
            health: e.maxHealth ?? 2.4,
            legShotTime: 0
          };
        }
        return e;
      });
    }

    if (byPlayer) {
      const mainScore = useStore.getState().localUserScore;
      const newMainScore = mainScore + extraScore;
      useStore.getState().setLocalUserScore(newMainScore);
      syncService.updatePresenceScore(newMainScore);
    }

    const compiledEvents = byPlayer 
      ? [...state.events, { id: Math.random().toString(), message: hitMessage, timestamp: Date.now() }, ...blastEvents, ...companionEvents] 
      : state.events;

    // Floating Damage Indicators and Combat Milestones calculation
    let isCritical = false;
    let showColor = '#22d3ee'; // default Neon Cyan
    if (byPlayer && targetEnemy) {
      const hasSpecialWeakpointMsg = damageTypeMsg?.includes('WEAKPOINT') || damageTypeMsg?.includes('HELMET') || damageTypeMsg?.includes('HEAD');
      isCritical = hasSpecialWeakpointMsg || Math.random() < 0.15;

      const colors = ['#f59e0b', '#ec4899', '#f43f5e', '#a855f7', '#ff003c', '#ffea00'];
      if (isCritical) {
        showColor = colors[Math.floor(Math.random() * colors.length)];
      }
    }

    let nextFirstBlood = state.firstBloodTriggered;
    let nextSurvivorStreak = state.survivorStreak;
    let nextMultiKillCount = state.multiKillCount;
    let nextLastDefeatTime = state.lastDefeatTime;
    const extraMatchLogs = [...state.matchLogs];

    if (enemyDefeated && byPlayer) {
      const now = Date.now();
      
      // 1) First Blood
      if (!nextFirstBlood) {
        nextFirstBlood = true;
        const msg = `🩸 FIRST BLOOD! Hostile ${enemyTypeName} ${id.replace('bot-', '#')} liquidated!`;
        extraMatchLogs.push({ id: Math.random().toString(), type: 'first-blood', message: msg, timestamp: now });
      }

      // 2) Multi-kill
      if (now - nextLastDefeatTime <= 4000) {
        nextMultiKillCount += 1;
        let mkMsg = '';
        if (nextMultiKillCount === 2) mkMsg = `⚡ DOUBLE NEUTRALIZATION! Double Kill!`;
        else if (nextMultiKillCount === 3) mkMsg = `🔥 TRIPLE NEUTRALIZATION! Multi-kill combo!`;
        else if (nextMultiKillCount === 4) mkMsg = `🌀 ULTRA NEUTRALIZATION! Quad-kill!`;
        else if (nextMultiKillCount >= 5) mkMsg = `💀 MONSTER NEUTRALIZATION! System overkill!`;
        
        if (mkMsg) {
          extraMatchLogs.push({ id: Math.random().toString(), type: 'multi-kill', message: mkMsg, timestamp: now });
        }
      } else {
        nextMultiKillCount = 1;
      }
      nextLastDefeatTime = now;

      // 3) Survivor Streak
      nextSurvivorStreak += 1;
      let streakMsg = '';
      if (nextSurvivorStreak === 3) streakMsg = `🏆 SURVIVOR STREAK: 3 hostiles downed! (Killing Spree)`;
      else if (nextSurvivorStreak === 5) streakMsg = `🏆 SURVIVOR STREAK: 5 hostiles downed! (Rampage)`;
      else if (nextSurvivorStreak === 10) streakMsg = `🏆 SURVIVOR STREAK: 10 hostiles downed! (Unstoppable)`;
      else if (nextSurvivorStreak === 15) streakMsg = `🏆 SURVIVOR STREAK: 15 hostiles downed! (Godlike)`;
      if (streakMsg) {
        extraMatchLogs.push({ id: Math.random().toString(), type: 'streak', message: streakMsg, timestamp: now });
      }
    }

    const newDamageTextList = byPlayer && targetEnemy ? [
      ...(state.damageTexts || []),
      {
        id: Math.random().toString(),
        text: actualDamage.toFixed(1),
        position: targetEnemy.position,
        timestamp: Date.now(),
        color: showColor,
        isCritical
      }
    ].slice(-39) : (state.damageTexts || []);

    return {
      enemies,
      score: byPlayer ? state.score + extraScore : state.score,
      events: compiledEvents,
      matchLogs: extraMatchLogs.slice(-24),
      firstBloodTriggered: nextFirstBlood,
      survivorStreak: nextSurvivorStreak,
      multiKillCount: nextMultiKillCount,
      lastDefeatTime: nextLastDefeatTime,
      damageTexts: newDamageTextList
    };
  }),

  addLaser: (start, end, color) => {
    const { socket } = get();
    if (socket) {
      socket.emit('shoot', { start, end, color });
    }
    soundManager.playLaser();
    set((state) => ({
      lasers: [...state.lasers, { id: Math.random().toString(36).substr(2, 9), start, end, timestamp: Date.now(), color }]
    }));
  },

  addParticles: (position, color) => set((state) => ({
    particles: [...state.particles, { id: Math.random().toString(36).substr(2, 9), position, timestamp: Date.now(), color }]
  })),

  addEvent: (message) => set((state) => ({
    events: [...state.events, { id: Math.random().toString(), message, timestamp: Date.now() }]
  })),

  updateEnemies: (time) => set((state) => {
    let changed = false;
    const enemies = state.enemies.map(e => {
      if (e.state === 'disabled' && time > e.disabledUntil) {
        changed = true;
        if (e.type !== 'boss') {
          // Counter-strike Deathmatch style: pick random location in the Arena on respawn
          const rx = (Math.random() - 0.5) * 170;
          const rz = (Math.random() - 0.5) * 170;
          const isInf = e.type === 'infiltrator';
          const isBomb = e.type === 'bombardier';
          const isOver = e.type === 'overseer';
          const isOp = e.type === 'drone_operator';
          const isDrone = e.type === 'support_drone';
          const max_hp = isInf ? 3.6 : isBomb ? 9.0 : isOver ? 6.0 : isOp ? 4.8 : isDrone ? 2.4 : 6.0;
          return {
            ...e,
            state: 'active' as EntityState,
            position: [rx, 1.0, rz] as [number, number, number],
            hasDodged: false,
            health: max_hp,
            maxHealth: max_hp,
            legShotTime: 0
          };
        }
        return { ...e, state: 'active' as EntityState };
      }
      return e;
    });
    
    // Also update other players' states
    let otherPlayers = state.otherPlayers;
    let playersChanged = false;
    Object.values(state.otherPlayers).forEach(p => {
      if (p.state === 'disabled' && time > p.disabledUntil) {
        if (!playersChanged) {
          otherPlayers = { ...state.otherPlayers };
          playersChanged = true;
        }
        otherPlayers[p.id] = { ...p, state: 'active' };
      }
    });

    if (state.playerState === 'disabled' && time > state.playerDisabledUntil) {
      return { enemies, playerState: 'active', otherPlayers: playersChanged ? otherPlayers : state.otherPlayers };
    }
    return changed || playersChanged ? { enemies, otherPlayers } : state;
  }),

  cleanupEffects: (time) => set((state) => {
    const lasers = state.lasers.filter(l => time - l.timestamp < 200); // Lasers last 200ms
    const particles = state.particles.filter(p => time - p.timestamp < 500); // Particles last 500ms
    const events = state.events.filter(e => time - e.timestamp < 5000); // Events last 5s
    const damageTexts = (state.damageTexts || []).filter(dt => time - dt.timestamp < 1000); // Damage texts last 1s
    if (lasers.length !== state.lasers.length || particles.length !== state.particles.length || events.length !== state.events.length || damageTexts.length !== (state.damageTexts || []).length) {
      return { lasers, particles, events, damageTexts };
    }
    return state;
  }),

  setPlayerState: (playerState) => set({ playerState }),

  updatePlayerPosition: (position, rotation) => {
    const { socket } = get();
    if (socket) {
      socket.emit('updatePosition', { position, rotation });
    }
    set({ playerPosition: position });
  }
}));
