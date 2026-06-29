import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';

export const DEFAULT_VRM_URL = 'https://storage.googleapis.com/gemmai-lounge-assets/VRM/Female1.vrm';

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
}

export interface Crystal {
  id: string;
  position: [number, number, number];
}

export interface User {
  id: string;
  name: string;
  score: number;
  vrmUrl: string | null;
  position: [number, number, number];
  rotation: [number, number, number];
  isLocal: boolean;
  lastUpdate: number;
  stream?: MediaStream;
}

export interface GuideClone {
  id: string;
  newUserId: string;
  newUserName: string;
  targetUserId: string;
  targetUserName: string;
}

export interface PhysicsProp {
  id: string;
  position: [number, number, number];
  color: string;
  type?: 'box' | 'sphere';
}

interface AppState {
  localUserId: string;
  localUserName: string;
  localUserScore: number;
  localUserGesture: string | null;
  localUserPosition: [number, number, number];
  localUserRotation: [number, number, number];
  localSkybox: string | null;
  joystickVector: { x: number, y: number };
  users: Record<string, User>;
  messages: ChatMessage[];
  crystals: Record<string, Crystal>;
  physicsProps: PhysicsProp[];
  vrmUrl: string | null;
  micStream: MediaStream | null;
  isMicMuted: boolean;
  masterVolume: number;
  mouseSensitivity: number;
  graphicsQuality: 'low' | 'medium' | 'high';
  setLocalUserId: (id: string) => void;
  setLocalUserName: (name: string) => void;
  setLocalUserScore: (score: number) => void;
  setLocalUserGesture: (gesture: string | null) => void;
  setLocalUserPosition: (pos: [number, number, number]) => void;
  setLocalUserRotation: (rot: [number, number, number]) => void;
  setLocalSkybox: (url: string | null) => void;
  setJoystickVector: (vector: { x: number, y: number }) => void;
  setLocalVrmUrl: (url: string) => void;
  updateUser: (id: string, data: Partial<User>) => void;
  removeUser: (id: string) => void;
  setMicStream: (stream: MediaStream | null) => void;
  addMessage: (msg: ChatMessage) => void;
  setCrystals: (crystals: Record<string, Crystal>) => void;
  removeCrystal: (id: string) => void;
  setPhysicsProps: (props: PhysicsProp[]) => void;
  setIsMicMuted: (muted: boolean) => void;
  setMasterVolume: (volume: number) => void;
  setMouseSensitivity: (sensitivity: number) => void;
  setGraphicsQuality: (quality: 'low' | 'medium' | 'high') => void;
  npcPosition: [number, number, number] | null;
  setNpcPosition: (pos: [number, number, number]) => void;
  currentRoom: string;
  setCurrentRoom: (room: string) => void;
  portalWarping: { active: boolean; targetRoom: string; color: string } | null;
  setPortalWarping: (state: { active: boolean; targetRoom: string; color: string } | null) => void;
  floorColor: string;
  backgroundColor: string;
  lightingEffect: 'standard' | 'neon' | 'dusk' | 'night' | 'studio';
  avatarLoading: boolean;
  avatarLoadingProgress: number;
  setFloorColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  setLightingEffect: (effect: 'standard' | 'neon' | 'dusk' | 'night' | 'studio') => void;
  setAvatarLoading: (loading: boolean) => void;
  setAvatarLoadingProgress: (progress: number) => void;
  isAvatarStudioOpen: boolean;
  setIsAvatarStudioOpen: (open: boolean) => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  isRadialMenuOpen: boolean;
  setIsRadialMenuOpen: (open: boolean) => void;
  sequencerGrid: boolean[][];
  updateSequencerGrid: (track: number, step: number, value: boolean) => void;
  setFullSequencerGrid: (grid: boolean[][]) => void;
  isFirstPerson: boolean;
  setIsFirstPerson: (val: boolean) => void;
  showEnemyHealthBars: boolean;
  setShowEnemyHealthBars: (show: boolean) => void;
  showMinimap: boolean;
  setShowMinimap: (show: boolean) => void;
  geminiApiKey: string;
  setGeminiApiKey: (key: string) => void;
  gravity: [number, number, number];
  setGravity: (val: [number, number, number]) => void;
  language: string;
  setLanguage: (lang: string) => void;
  voiceLanguage: string;
  setVoiceLanguage: (lang: string) => void;
  weather: 'clear' | 'light_rain' | 'neon_fog' | 'solar_storm';
  setWeather: (weather: 'clear' | 'light_rain' | 'neon_fog' | 'solar_storm') => void;
  guideClones: GuideClone[];
  addGuideClone: (clone: GuideClone) => void;
  removeGuideClone: (id: string) => void;
}

const getInitialLanguage = (): string => {
  if (typeof window !== 'undefined' && window.navigator) {
    const navLanguage = window.navigator.language || (window.navigator.languages && window.navigator.languages[0]) || 'en';
    const shortLang = navLanguage.split('-')[0].toLowerCase();
    const supported = ['en', 'es', 'ja', 'fr', 'de', 'pt', 'it', 'ko', 'zh', 'ru'];
    if (supported.includes(shortLang)) {
      return shortLang;
    }
  }
  return 'en';
};

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      localUserId: uuidv4(),
      localUserName: `Player ${Math.floor(Math.random() * 10000)}`,
      localUserScore: 0,
      localUserGesture: null,
      localUserPosition: [(Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4],
      localUserRotation: [0, 0, 0],
      localSkybox: null,
      joystickVector: { x: 0, y: 0 },
      users: {},
      messages: [],
      crystals: {},
      physicsProps: Array.from({ length: 15 }).map((_, i) => ({
        id: `prop-${i}`,
        position: [Math.random() * 20 - 10, 5 + i * 2, Math.random() * 20 - 10] as [number, number, number],
        color: `hsl(${Math.random() * 360}, 80%, 60%)`
      })),
      vrmUrl: DEFAULT_VRM_URL,
      micStream: null,
      isMicMuted: false,
      masterVolume: 1,
      mouseSensitivity: 1,
      graphicsQuality: 'low',
      npcPosition: null,
      currentRoom: 'main',
      portalWarping: null,
      weather: 'clear',
      sequencerGrid: Array(4).fill(null).map(() => Array(16).fill(false)),
      floorColor: '#303030', // Default floor color
      backgroundColor: '#1a1a1a', // Default background color
      lightingEffect: 'standard', // Default lighting
      avatarLoading: true,
      avatarLoadingProgress: 0,
      isAvatarStudioOpen: false,
      isSettingsOpen: false,
      isRadialMenuOpen: false,
      isFirstPerson: false,
      showEnemyHealthBars: true,
      showMinimap: true,
      geminiApiKey: '',
      gravity: [0, -9.81, 0],
      language: getInitialLanguage(),
      setLanguage: (lang) => set({ language: lang }),
      voiceLanguage: 'auto',
      setVoiceLanguage: (lang) => set({ voiceLanguage: lang }),
      setWeather: (weather) => set({ weather }),
      guideClones: [],
      addGuideClone: (clone) => set((state) => ({ guideClones: [...state.guideClones, clone] })),
      removeGuideClone: (id) => set((state) => ({ guideClones: state.guideClones.filter(c => c.id !== id) })),
      setIsFirstPerson: (val) => set({ isFirstPerson: val }),
      setShowEnemyHealthBars: (show) => set({ showEnemyHealthBars: show }),
      setShowMinimap: (show) => set({ showMinimap: show }),
      setGeminiApiKey: (key) => set({ geminiApiKey: key }),
      setGravity: (val) => set({ gravity: val }),
      setLocalUserId: (id) => set({ localUserId: id }),
      setLocalUserName: (name) => set({ localUserName: name }),
      setLocalUserScore: (score) => set({ localUserScore: score }),
      setLocalUserGesture: (gesture) => set({ localUserGesture: gesture }),
      setLocalUserPosition: (pos) => set({ localUserPosition: pos }),
      setLocalUserRotation: (rot) => set({ localUserRotation: rot }),
      setLocalSkybox: (url) => set({ localSkybox: url }),
      setJoystickVector: (vector) => set({ joystickVector: vector }),
      setLocalVrmUrl: (url) => set({ vrmUrl: url }),
      setCurrentRoom: (room) => set({ currentRoom: room }),
      setPortalWarping: (state) => set({ portalWarping: state }),
      setAvatarLoading: (loading) => set({ avatarLoading: loading }),
      setAvatarLoadingProgress: (progress) => set({ avatarLoadingProgress: progress }),
      setIsAvatarStudioOpen: (open) => set({ isAvatarStudioOpen: open }),
      setIsSettingsOpen: (open) => set({ isSettingsOpen: open }),
      setIsRadialMenuOpen: (open) => set({ isRadialMenuOpen: open }),
      updateSequencerGrid: (track, step, value) => set((state) => {
        const newGrid = state.sequencerGrid.map((t, i) =>
          i === track ? t.map((s, j) => (j === step ? value : s)) : t
        );
        return { sequencerGrid: newGrid };
      }),
      setFullSequencerGrid: (grid) => set({ sequencerGrid: grid }),
      updateUser: (id, data) =>
        set((state) => ({
          users: {
            ...state.users,
            [id]: {
              ...(state.users[id] || {
                id,
                name: `Player ${id.slice(0, 4)}`,
                score: 0,
                vrmUrl: DEFAULT_VRM_URL,
                position: [0, 0, 0],
                rotation: [0, 0, 0],
                isLocal: false,
                lastUpdate: Date.now(),
              }),
              ...data,
              lastUpdate: Date.now(),
            },
          },
        })),
      removeUser: (id) =>
        set((state) => {
          const newUsers = { ...state.users };
          delete newUsers[id];
          return { users: newUsers };
        }),
      setMicStream: (stream) => set({ micStream: stream }),
      addMessage: (msg) => set((state) => {
        if (state.messages.some(m => m.id === msg.id)) {
          return state;
        }
        return { messages: [...state.messages, msg] };
      }),
      setCrystals: (crystals) => set({ crystals }),
      removeCrystal: (id) => set((state) => {
        const newCrystals = { ...state.crystals };
        delete newCrystals[id];
        return { crystals: newCrystals };
      }),
      setPhysicsProps: (props) => set({ physicsProps: props }),
      setIsMicMuted: (muted) => set((state) => {
        if (state.micStream) {
          state.micStream.getAudioTracks().forEach(track => {
            track.enabled = !muted;
          });
        }
        return { isMicMuted: muted };
      }),
      setMasterVolume: (volume) => set({ masterVolume: volume }),
      setMouseSensitivity: (sensitivity) => set({ mouseSensitivity: sensitivity }),
      setGraphicsQuality: (quality) => set({ graphicsQuality: quality }),
      setNpcPosition: (pos) => set({ npcPosition: pos }),
      setFloorColor: (color) => set({ floorColor: color }),
      setBackgroundColor: (color) => set({ backgroundColor: color }),
      setLightingEffect: (effect) => set({ lightingEffect: effect })
    }),
    {
      name: 'gaming-lounge-storage',
      partialize: (state) => ({
        localUserName: state.localUserName,
        localUserScore: state.localUserScore,
        vrmUrl: state.vrmUrl,
        isMicMuted: state.isMicMuted,
        masterVolume: state.masterVolume,
        mouseSensitivity: state.mouseSensitivity,
        graphicsQuality: state.graphicsQuality,
        floorColor: state.floorColor,
        backgroundColor: state.backgroundColor,
        lightingEffect: state.lightingEffect,
        showEnemyHealthBars: state.showEnemyHealthBars,
        showMinimap: state.showMinimap,
        geminiApiKey: state.geminiApiKey,
        language: state.language,
        voiceLanguage: state.voiceLanguage,
      }),
    }
  )
);
