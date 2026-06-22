import React, { useState, useEffect } from 'react';
import { 
  Settings, X, Mic, MicOff, Volume2, Monitor, Palette, Lightbulb, Map,
  Eye, EyeOff, User, Glasses, Wand2, Image as ImageIcon, Server, Wifi, WifiOff, Activity, Cpu, Lock, Unlock
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { generateEnvironment } from '../services/ai';
import { syncService } from '../services/sync';
import { xrStore } from './VRInterface';
import { getTranslation, languageNames } from '../utils/translations';

export const SettingsMenu: React.FC = () => {
  const isOpen = useStore(state => state.isSettingsOpen);
  const setIsOpen = useStore(state => state.setIsSettingsOpen);
  const language = useStore(state => state.language);
  const setLanguage = useStore(state => state.setLanguage);
  const voiceLanguage = useStore(state => state.voiceLanguage);
  const setVoiceLanguage = useStore(state => state.setVoiceLanguage);
  
  const isMicMuted = useStore(state => state.isMicMuted);
  const setIsMicMuted = useStore(state => state.setIsMicMuted);
  const masterVolume = useStore(state => state.masterVolume);
  const setMasterVolume = useStore(state => state.setMasterVolume);
  const mouseSensitivity = useStore(state => state.mouseSensitivity);
  const setMouseSensitivity = useStore(state => state.setMouseSensitivity);
  const graphicsQuality = useStore(state => state.graphicsQuality);
  const setGraphicsQuality = useStore(state => state.setGraphicsQuality);
  const floorColor = useStore(state => state.floorColor);
  const setFloorColor = useStore(state => state.setFloorColor);
  const backgroundColor = useStore(state => state.backgroundColor);
  const setBackgroundColor = useStore(state => state.setBackgroundColor);
  const lightingEffect = useStore(state => state.lightingEffect);
  const setLightingEffect = useStore(state => state.setLightingEffect);

  // Added integrations from other panels
  const currentRoom = useStore(state => state.currentRoom);
  const isFirstPerson = useStore(state => state.isFirstPerson);
  const setIsFirstPerson = useStore(state => state.setIsFirstPerson);
  const showEnemyHealthBars = useStore(state => state.showEnemyHealthBars);
  const setShowEnemyHealthBars = useStore(state => state.setShowEnemyHealthBars);
  const showMinimap = useStore(state => state.showMinimap);
  const setShowMinimap = useStore(state => state.setShowMinimap);
  const geminiApiKey = useStore(state => state.geminiApiKey);
  const setGeminiApiKey = useStore(state => state.setGeminiApiKey);
  const [showKey, setShowKey] = useState(false);

  // Connection & stats state
  const [socketConnected, setSocketConnected] = useState(false);
  const isAvatarStudioOpen = useStore(state => state.isAvatarStudioOpen);
  const [peerConnected, setPeerConnected] = useState(false);
  const connectedUsersCount = useStore(state => Object.keys(state.users).length);

  // WebXR support state
  const [vrSupported, setVrSupported] = useState(false);

  // Render engine backend state
  const [rendererBackend, setRendererBackend] = useState<'webgl' | 'webgpu'>(() => {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      return (localStorage.getItem('rendering_backend') as 'webgl' | 'webgpu') || 'webgl';
    }
    return 'webgl';
  });

  // Admin lock states for GemmaOS API Key
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [passcodeAttempt, setPasscodeAttempt] = useState('');
  const [showPasscodeInput, setShowPasscodeInput] = useState(false);
  const [passcodeError, setPasscodeError] = useState(false);

  const handleVerifyPasscode = () => {
    const cleanAttempt = passcodeAttempt.trim().toLowerCase();
    if (cleanAttempt === 'gemmaos2026' || cleanAttempt === 'hephaestus') {
      setIsAdminUnlocked(true);
      setPasscodeError(false);
      setShowPasscodeInput(false);
    } else {
      setPasscodeError(true);
    }
  };

  const handleRendererChange = (backend: 'webgl' | 'webgpu') => {
    setRendererBackend(backend);
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      localStorage.setItem('rendering_backend', backend);
      window.location.reload();
    }
  };

  // Skybox gen state
  const [skyboxPrompt, setSkyboxPrompt] = useState('');
  const [generatingSkybox, setGeneratingSkybox] = useState(false);
  const setLocalSkybox = useStore(state => state.setLocalSkybox);

  useEffect(() => {
    if (!isOpen) return;

    // Check VR support
    if ('xr' in navigator) {
      // @ts-ignore
      navigator.xr.isSessionSupported('immersive-vr').then((supported: boolean) => {
        setVrSupported(supported);
      });
    }

    // Ping check socket
    const checkSocket = setInterval(() => {
      // @ts-ignore
      if (syncService.socket && syncService.socket.connected) {
        setSocketConnected(true);
      } else {
        setSocketConnected(false);
      }
    }, 1000);

    // Ping check peer
    const checkPeer = setInterval(() => {
      // @ts-ignore
      if (syncService.peer && !syncService.peer.disconnected && !syncService.peer.destroyed) {
        setPeerConnected(true);
      } else {
        setPeerConnected(false);
      }
    }, 1500);

    return () => {
      clearInterval(checkSocket);
      clearInterval(checkPeer);
    };
  }, [isOpen]);

  const handleGenerateSkybox = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skyboxPrompt.trim() || generatingSkybox) return;

    setGeneratingSkybox(true);
    try {
      const imageUrl = await generateEnvironment(skyboxPrompt);
      setLocalSkybox(imageUrl);
      setSkyboxPrompt('');
      alert("Skybox generated and applied successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to generate environment.");
    } finally {
      setGeneratingSkybox(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`absolute top-[184px] left-4 bg-zinc-900/80 backdrop-blur-md p-3 rounded-full border border-white/10 hover:bg-zinc-800 transition-all shadow-lg text-white duration-300 ${
          isAvatarStudioOpen 
            ? 'opacity-0 scale-95 pointer-events-none z-0' 
            : 'opacity-100 scale-100 pointer-events-auto z-40'
        }`}
        title="Settings"
      >
        <Settings className="w-6 h-6" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-white/10 p-6 rounded-2xl shadow-2xl max-w-md w-full mx-4 relative animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>

            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
              <Settings className="w-6 h-6 text-purple-400" />
              {getTranslation(language, 'settings')}
            </h2>

            <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
              {/* Language Selection Dropdown */}
              <div className="space-y-2 border-b border-white/10 pb-4">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">Language / Idioma / 言語</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500/50 cursor-pointer"
                >
                  {Object.entries(languageNames).map(([code, name]) => (
                    <option key={code} value={code} className="bg-zinc-900 text-white">
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Voice / Dictation Language Selection Dropdown */}
              <div className="space-y-2 border-b border-white/10 pb-4">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                    {getTranslation(language, 'voiceSettingLabel')}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-light leading-snug">
                    {getTranslation(language, 'voiceSettingDesc')}
                  </span>
                </div>
                <select
                  value={voiceLanguage}
                  onChange={(e) => setVoiceLanguage(e.target.value)}
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500/50 cursor-pointer outline-none font-medium"
                >
                  <option value="auto" className="bg-zinc-900 text-purple-400 font-semibold">
                    ✨ {getTranslation(language, 'voiceAutoDetectOption')}
                  </option>
                  {Object.entries(languageNames).map(([code, name]) => (
                    <option key={code} value={code} className="bg-zinc-900 text-white">
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Microphone Toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-zinc-200">
                  {isMicMuted ? <MicOff className="w-5 h-5 text-red-400" /> : <Mic className="w-5 h-5 text-emerald-400" />}
                  <span className="font-medium">{getTranslation(language, 'microphone')}</span>
                </div>
                <button
                  onClick={() => setIsMicMuted(!isMicMuted)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    isMicMuted 
                      ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' 
                      : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                  }`}
                >
                  {isMicMuted ? getTranslation(language, 'muted') : getTranslation(language, 'active')}
                </button>
              </div>

              {/* Master Volume */}
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-zinc-200">
                  <Volume2 className="w-5 h-5 text-blue-400" />
                  <span className="font-medium">{getTranslation(language, 'masterVolume')}</span>
                  <span className="ml-auto text-sm text-zinc-400">{Math.round(masterVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={masterVolume}
                  onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>

              {/* Mouse Sensitivity */}
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-zinc-200">
                  <Settings className="w-5 h-5 text-zinc-400" />
                  <span className="font-medium">{getTranslation(language, 'mouseSensitivity')}</span>
                  <span className="ml-auto text-sm text-zinc-400">{mouseSensitivity.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="3"
                  step="0.1"
                  value={mouseSensitivity}
                  onChange={(e) => setMouseSensitivity(parseFloat(e.target.value))}
                  className="w-full accent-zinc-500"
                />
              </div>

              {/* Graphics Quality */}
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-zinc-200">
                  <Monitor className="w-5 h-5 text-amber-400" />
                  <span className="font-medium">{getTranslation(language, 'graphicsQuality')}</span>
                </div>
                <div className="flex gap-2 text-sm">
                  <button
                    onClick={() => setGraphicsQuality('low')}
                    className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                      graphicsQuality === 'low'
                        ? 'bg-amber-500 text-black'
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    }`}
                  >
                    {getTranslation(language, 'low')}
                  </button>
                  <button
                    onClick={() => setGraphicsQuality('medium')}
                    className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                      graphicsQuality === 'medium'
                        ? 'bg-amber-500 text-black'
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    }`}
                  >
                    {getTranslation(language, 'medium')}
                  </button>
                  <button
                    onClick={() => setGraphicsQuality('high')}
                    className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                      graphicsQuality === 'high'
                        ? 'bg-amber-500 text-black'
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    }`}
                  >
                    {getTranslation(language, 'high')}
                  </button>
                </div>
              </div>

              {/* Render Engine Backend (WebGL vs WebGPU) */}
              <div className="space-y-3 border-t border-white/10 pt-4 mt-2">
                <div className="flex items-center gap-3 text-zinc-200">
                  <Cpu className="w-5 h-5 text-emerald-400" />
                  <div className="flex flex-col">
                    <span className="font-medium">{getTranslation(language, 'renderingBackend')}</span>
                  </div>
                </div>
                <div className="flex gap-2 text-sm">
                  <button
                    onClick={() => handleRendererChange('webgl')}
                    className={`flex-1 py-2 rounded-lg font-medium transition-all text-xs ${
                      rendererBackend === 'webgl'
                        ? 'bg-emerald-500 text-black shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                    }`}
                  >
                    {getTranslation(language, 'stableWebGL')}
                  </button>
                  <button
                    onClick={() => handleRendererChange('webgpu')}
                    className={`flex-1 py-2 rounded-lg font-medium transition-all text-xs ${
                      rendererBackend === 'webgpu'
                        ? 'bg-emerald-500 text-black shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                    }`}
                  >
                    {getTranslation(language, 'experimentalWebGPU')}
                  </button>
                </div>
                <p className="text-[10px] text-zinc-500 leading-relaxed">
                  {getTranslation(language, 'aboutRendererDesc')}
                </p>
              </div>

              {/* GemmaOS Hive-Mind Sync Key */}
              <div className="space-y-3 border-t border-white/10 pt-4 mt-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-zinc-200">
                    <Activity className="w-5 h-5 text-purple-400 animate-pulse" />
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">GemmaOS Synergetic Matrix Key</span>
                      <span className="text-[10px] text-zinc-500 font-light pr-2 leading-tight">Syncs Gemini Key with Firebase RTDB swarm & local subagents</span>
                    </div>
                  </div>
                  <div>
                    {isAdminUnlocked ? (
                      <span className="text-[10px] text-purple-400 border border-purple-500/20 bg-purple-500/5 px-2 py-0.5 rounded-full font-mono flex items-center gap-1">
                        <Unlock className="w-2.5 h-2.5" /> Unlocked
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-400 border border-white/5 bg-zinc-950/20 px-2 py-0.5 rounded-full font-mono flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" /> Locked
                      </span>
                    )}
                  </div>
                </div>

                {!isAdminUnlocked ? (
                  <div className="bg-zinc-950/40 border border-white/5 rounded-xl p-3.5 space-y-3">
                    <p className="text-[11px] text-zinc-400 leading-relaxed font-light">
                      🔒 <strong className="text-zinc-300 font-medium">Developer Protection Active:</strong> To guarantee continuous uptime for GemmaOS, visitor sessions are restricted from altering the central API gateway credentials.
                    </p>
                    
                    {!showPasscodeInput ? (
                      <button
                        type="button"
                        onClick={() => {
                          setShowPasscodeInput(true);
                          setPasscodeError(false);
                        }}
                        className="w-full bg-purple-600/10 hover:bg-purple-600/25 border border-purple-500/20 hover:border-purple-500/40 text-purple-400 rounded-lg py-1.5 text-[10px] font-medium transition-all uppercase tracking-wider"
                      >
                        Unlock Creator Panel
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="password"
                            placeholder="Enter administrator passcode..."
                            value={passcodeAttempt}
                            onChange={(e) => {
                              setPasscodeAttempt(e.target.value);
                              setPasscodeError(false);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleVerifyPasscode();
                            }}
                            className="w-full bg-zinc-950/80 border border-white/10 rounded-lg px-3 py-1.5 text-[10px] text-white focus:outline-none focus:border-purple-500 transition-colors font-mono"
                          />
                          <button
                            type="button"
                            onClick={handleVerifyPasscode}
                            className="bg-purple-600 hover:bg-purple-500 text-white rounded-lg px-3 py-1.5 text-[10px] font-semibold transition-colors shrink-0"
                          >
                            Verify
                          </button>
                        </div>
                        {passcodeError && (
                          <p className="text-[9px] text-rose-400 font-light">
                            ❌ Invalid authentication payload. Handshake declined.
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setShowPasscodeInput(false);
                            setPasscodeAttempt('');
                          }}
                          className="text-[9px] text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="relative flex items-center">
                      <input
                        type={showKey ? "text" : "password"}
                        value={geminiApiKey}
                        onChange={(e) => setGeminiApiKey(e.target.value)}
                        placeholder="Enter your Gemini / GemmaOS API Key..."
                        className="w-full bg-zinc-950/50 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500/50 transition-colors pr-10 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-3 text-zinc-500 hover:text-white transition-colors"
                      >
                        {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {geminiApiKey ? (
                      <p className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1 bg-emerald-500/5 py-1 px-2 rounded border border-emerald-500/10">
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                        <span>● Swarm Nexus Dynamic Sync: ACTIVE</span>
                      </p>
                    ) : (
                      <p className="text-[10px] text-zinc-500 leading-relaxed font-light">
                        Entering a key here automatically synchronizes with the core brain, bot, and local subagents.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setIsAdminUnlocked(false);
                        setPasscodeAttempt('');
                      }}
                      className="w-full bg-zinc-800 hover:bg-zinc-750 border border-white/5 text-zinc-400 hover:text-white rounded-lg py-1.5 text-[10px] font-medium transition-all"
                    >
                      Lock Creator Access
                    </button>
                  </>
                )}
              </div>

              {/* Enemy Floating HUD Toggle */}
              <div className="flex items-center justify-between border-t border-white/10 pt-4 mt-2">
                <div className="flex items-center gap-3 text-zinc-200">
                  {showEnemyHealthBars ? <Eye className="w-5 h-5 text-purple-400" /> : <EyeOff className="w-5 h-5 text-zinc-500" />}
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">{getTranslation(language, 'enemyHealthbarTag')}</span>
                    <span className="text-[10px] text-zinc-500 font-light max-w-[200px]">{getTranslation(language, 'enemyHUDDesc')}</span>
                  </div>
                </div>
                <button
                  onClick={() => setShowEnemyHealthBars(!showEnemyHealthBars)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors text-sm ${
                    showEnemyHealthBars 
                      ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30' 
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                  }`}
                >
                  {showEnemyHealthBars ? getTranslation(language, 'visible') : getTranslation(language, 'hidden')}
                </button>
              </div>

              {/* Minimap Toggle */}
              <div className="flex items-center justify-between border-t border-white/10 pt-4 mt-2">
                <div className="flex items-center gap-3 text-zinc-200">
                  <Map className={`w-5 h-5 ${showMinimap ? 'text-purple-400' : 'text-zinc-500'}`} />
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">{getTranslation(language, 'minimapHUD')}</span>
                    <span className="text-[10px] text-zinc-500 font-light max-w-[200px]">{getTranslation(language, 'minimapHUDDesc')}</span>
                  </div>
                </div>
                <button
                  onClick={() => setShowMinimap(!showMinimap)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors text-sm ${
                    showMinimap 
                      ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30' 
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                  }`}
                >
                  {showMinimap ? getTranslation(language, 'visible') : getTranslation(language, 'hidden')}
                </button>
              </div>

              {/* Lighting Effect */}
              <div className="space-y-3 border-t border-white/10 pt-4 mt-2">
                <div className="flex items-center gap-3 text-zinc-200">
                  <Lightbulb className="w-5 h-5 text-yellow-400" />
                  <span className="font-medium">{getTranslation(language, 'lightingAtmosphere')}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {['standard', 'neon', 'dusk', 'night', 'studio'].map((preset) => (
                    <button
                      key={preset}
                      onClick={() => setLightingEffect(preset as any)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                        lightingEffect === preset
                          ? 'bg-yellow-500 text-black font-semibold'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Colors */}
              <div className="flex gap-4 border-b border-white/10 pb-4">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2 text-zinc-200 text-sm">
                    <Palette className="w-4 h-4 text-pink-400" />
                    <span>{getTranslation(language, 'floorBase')}</span>
                  </div>
                  <input
                    type="color"
                    value={floorColor}
                    onChange={(e) => setFloorColor(e.target.value)}
                    className="w-full h-10 rounded border-none cursor-pointer bg-transparent"
                  />
                </div>
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2 text-zinc-200 text-sm">
                    <Palette className="w-4 h-4 text-purple-400" />
                    <span>{getTranslation(language, 'skyFogBase')}</span>
                  </div>
                  <input
                    type="color"
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    className="w-full h-10 rounded border-none cursor-pointer bg-transparent"
                  />
                </div>
              </div>

              {/* Camera Perspective - Moved from Main Screen */}
              {currentRoom !== 'arena' && (
                <div className="space-y-3 pt-2">
                  <span className="text-sm font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                    <Eye className="w-4 h-4 text-cyan-400" /> {getTranslation(language, 'cameraPerspective')}
                  </span>
                  <div className="flex bg-zinc-950/65 rounded-xl p-1 border border-white/5">
                    <button
                      onClick={() => setIsFirstPerson(true)}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                        isFirstPerson 
                          ? 'bg-cyan-500 text-black shadow-lg font-extrabold' 
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      <Eye className="w-4 h-4" /> {getTranslation(language, 'firstPersonMode')}
                    </button>
                    <button
                      onClick={() => setIsFirstPerson(false)}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                        !isFirstPerson 
                          ? 'bg-cyan-500 text-black shadow-lg font-extrabold' 
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      <User className="w-4 h-4" /> {getTranslation(language, 'thirdPersonMode')}
                    </button>
                  </div>
                </div>
              )}

              {/* AI Skybox Generator - Moved from Main Screen */}
              <div className="space-y-3 pt-2 border-t border-white/10">
                <span className="text-sm font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-purple-400" /> {getTranslation(language, 'aiSkyboxGen')}
                </span>
                <form onSubmit={handleGenerateSkybox} className="flex gap-2">
                  <div className="relative flex-1">
                    <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                      type="text"
                      value={skyboxPrompt}
                      onChange={e => setSkyboxPrompt(e.target.value)}
                      placeholder={getTranslation(language, 'aiSkyboxPlaceholder')}
                      className="w-full bg-zinc-950/50 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500/50 transition-colors"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={generatingSkybox || !skyboxPrompt.trim()}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-semibold rounded-xl transition-colors shrink-0 flex items-center gap-1"
                  >
                    {generatingSkybox ? (
                      <Wand2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      getTranslation(language, 'generate')
                    )}
                  </button>
                </form>
                <p className="text-[10px] text-zinc-500 leading-relaxed">
                  {getTranslation(language, 'aiSkyboxDesc')}
                </p>
              </div>

              {/* WebXR supports - Entering Virtual Reality */}
              <div className="space-y-3 pt-2 border-t border-white/10">
                <span className="text-sm font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                  <Glasses className="w-4 h-4 text-emerald-400" /> {getTranslation(language, 'vrWebXR')}
                </span>
                <button
                  onClick={() => {
                    try {
                      xrStore.enterVR();
                    } catch (err) {
                      console.error(err);
                      alert(getTranslation(language, 'webXRDesc'));
                    }
                  }}
                  className={`w-full py-2.5 font-semibold rounded-xl transition-all flex items-center justify-center gap-2 text-sm ${
                    vrSupported 
                      ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-black border border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.1)] hover:shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                      : 'bg-zinc-800 text-zinc-400 border border-white/5 hover:bg-zinc-700 hover:text-white'
                  }`}
                >
                  <Glasses className="w-4 h-4" /> {vrSupported ? getTranslation(language, 'enterVR') : getTranslation(language, 'launchWebXR')}
                </button>
                {!vrSupported && (
                  <p className="text-[10px] text-zinc-500 leading-relaxed text-center">
                    {getTranslation(language, 'webXRDesc')}
                  </p>
                )}
              </div>

              {/* Systems & Network Status - Moved from Main Screen */}
              <div className="space-y-3 pt-2 border-t border-white/10">
                <span className="text-sm font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                  <Activity className="w-4 h-4 text-rose-500 animate-pulse" /> {getTranslation(language, 'networkSystems')}
                </span>
                <div className="grid grid-cols-2 gap-3 bg-zinc-950/40 p-3 rounded-xl border border-white/5">
                  <div className="flex items-center gap-2">
                    <Server className={`w-4 h-4 ${socketConnected ? 'text-emerald-400' : 'text-red-400'}`} />
                    <div className="flex flex-col">
                      <span className="text-[10px] text-zinc-500 uppercase">{getTranslation(language, 'server')}</span>
                      <span className="text-xs font-bold text-white leading-none mt-0.5">
                        {socketConnected ? getTranslation(language, 'connected') : getTranslation(language, 'disconnected')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {peerConnected ? (
                      <Wifi className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <WifiOff className="w-4 h-4 text-amber-400" />
                    )}
                    <div className="flex flex-col">
                      <span className="text-[10px] text-zinc-500 uppercase">{getTranslation(language, 'signaling')}</span>
                      <span className="text-xs font-bold text-white leading-none mt-0.5">
                        {peerConnected ? getTranslation(language, 'active') : getTranslation(language, 'connecting')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                    <span className="text-[10px] text-zinc-500 uppercase">{getTranslation(language, 'regionUsers')}</span>
                    <span className="text-xs font-bold text-white font-mono ml-auto">
                      {connectedUsersCount + 1}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                    <span className="text-[10px] text-zinc-500 uppercase">{getTranslation(language, 'loungePing')}</span>
                    <span className="text-xs font-bold text-emerald-400 font-mono ml-auto">
                      ~45ms
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </>
  );
};
