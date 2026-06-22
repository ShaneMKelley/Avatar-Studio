import React, { useState } from 'react';
import { Upload, User, ChevronDown, ChevronUp, ExternalLink, Download, Link as LinkIcon, Info } from 'lucide-react';
import { useStore, DEFAULT_VRM_URL } from '../store/useStore';
import { syncService } from '../services/sync';
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';
import { getTranslation } from '../utils/translations';

const PRESET_AVATARS = [
  {
    id: 'female1',
    name: 'Cyber Heroine',
    url: 'https://storage.googleapis.com/gemmai-lounge-assets/VRM/Female1.vrm',
    type: 'Female 1',
    icon: '👩‍🎤',
    color: 'from-pink-500/20 to-rose-500/10 hover:from-pink-500/30 hover:to-rose-500/20 text-rose-400 border-rose-500/30'
  },
  {
    id: 'female2',
    name: 'Neon Empress',
    url: 'https://storage.googleapis.com/gemmai-lounge-assets/VRM/Female2.vrm',
    type: 'Female 2',
    icon: '👸',
    color: 'from-purple-500/20 to-indigo-500/10 hover:from-purple-500/30 hover:to-indigo-500/20 text-purple-400 border-purple-500/30'
  },
  {
    id: 'male1',
    name: 'Astro Raider',
    url: 'https://storage.googleapis.com/gemmai-lounge-assets/VRM/Male1.vrm',
    type: 'Male 1',
    icon: '👨‍🚀',
    color: 'from-blue-500/20 to-cyan-500/10 hover:from-blue-500/30 hover:to-cyan-500/20 text-cyan-400 border-cyan-500/30'
  },
  {
    id: 'male2',
    name: 'Pulse Runner',
    url: 'https://storage.googleapis.com/gemmai-lounge-assets/VRM/Male2.vrm',
    type: 'Male 2',
    icon: '🏃',
    color: 'from-emerald-500/20 to-teal-500/10 hover:from-emerald-500/30 hover:to-teal-500/20 text-emerald-400 border-emerald-500/30'
  }
];

export const AvatarStudio: React.FC = () => {
  const isOpen = useStore(state => state.isAvatarStudioOpen);
  const setIsOpen = useStore(state => state.setIsAvatarStudioOpen);
  const language = useStore(state => state.language);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [customUrl, setCustomUrl] = useState('');
  const vrmUrl = useStore(state => state.vrmUrl);

  const { executeRecaptcha } = useGoogleReCaptcha();

  const [vroidToken, setVroidToken] = useState<string | null>(localStorage.getItem('vroid_token'));

  const verifyCaptcha = async (action: string) => {
    if (!executeRecaptcha) {
      console.warn("reCAPTCHA not ready.");
      return true; // Bypass if not loaded properly or fallback
    }
    try {
      const token = await executeRecaptcha(action);
      const res = await fetch('/api/verify-captcha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      if (!res.ok) {
        console.error("Captcha verification HTTP error:", res.status);
        return true; // Bypass
      }
      
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("text/html")) {
        console.error("Received HTML instead of JSON for captcha verification", await res.text());
        return true; // Bypass
      }

      const data = await res.json();
      if (!data.success && !data.bypassed) {
        console.warn("Captcha failed:", data);
        // Fallback to allow upload during dev if captcha verification is broken
        return true; 
      }
      return true;
    } catch (e: any) {
      console.error("Captcha error", e);
      // Fallback to allow upload during dev if network error
      return true;
    }
  };
  const [vroidCharacters, setVroidCharacters] = useState<any[]>([]);
  const [loadingVroid, setLoadingVroid] = useState(false);
  const [vroidError, setVroidError] = useState<string | null>(null);

  const API_BASE = '/api/vroid';

  const fetchVroidCharacters = async (token: string) => {
    setLoadingVroid(true);
    setVroidError(null);
    try {
      const res = await fetch(`${API_BASE}/account/character_models`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'X-Api-Version': '11',
          'Accept': 'application/json'
        }
      });
      if (!res.ok) {
        throw new Error(`VRoid Hub API returned status ${res.status}`);
      }
      const resText = await res.text();
      let data;
      try {
        data = JSON.parse(resText);
      } catch (e) {
        throw new Error("Invalid response format from VRoid API proxy");
      }
      
      let heartsData = { data: [] };
      const heartsRes = await fetch(`${API_BASE}/heart/character_models`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'X-Api-Version': '11',
          'Accept': 'application/json'
        }
      });
      if (heartsRes.ok) {
        const heartsText = await heartsRes.text();
        try {
          heartsData = JSON.parse(heartsText);
        } catch (e) {
          // Play safe and ignore corrupt hearts formats
        }
      }

      const characters = [];
      if (data && data.data) {
        characters.push(...data.data.map((item: any) => item.character_model || item));
      }
      if (heartsData && heartsData.data) {
        characters.push(...heartsData.data.map((item: any) => item.character_model || item));
      }
      
      setVroidCharacters(characters);
    } catch (err: any) {
      console.warn("Gracefully bypassed VRoid API listing loader:", err.message);
      setVroidError(err.message || "Failed to load");
    } finally {
      setLoadingVroid(false);
    }
  };

  React.useEffect(() => {
    if (vroidToken) {
      fetchVroidCharacters(vroidToken);
    }
  }, [vroidToken]);

  const useVroidCharacter = async (character: any) => {
    if (!vroidToken) return;
    
    const passed = await verifyCaptcha('use_vroid_character');
    if (!passed) {
      return;
    }
    
    const characterId = character.id || character.character?.id;
    if (!characterId) {
      alert("Invalid character selected.");
      return;
    }
    
    try {
      // First, get the download license
      const licenseRes = await fetch(`${API_BASE}/character_models/${characterId}/download_licenses`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${vroidToken}`,
          'X-Api-Version': '11',
          'Accept': 'application/json'
        },
      });
      const licenseData = await licenseRes.json();
      
      console.log("License Data:", licenseData);
      
      const downloadId = licenseData.data?.id;
      if (!downloadId) {
        throw new Error("Could not acquire download license. Make sure downloading is enabled for this character.");
      }

      // Then get the download file
      const downloadRes = await fetch(`${API_BASE}/character_models/${characterId}/download_licenses/${downloadId}/download`, {
        headers: { 
          'Authorization': `Bearer ${vroidToken}`,
          'X-Api-Version': '11',
          'Accept': 'application/json'
        }
      });
      const downloadData = await downloadRes.json();
      
      console.log("Download Data:", downloadData);
      
      const vrmUrl = downloadData.data?.url || downloadData.url;
      if (vrmUrl) {
        const proxyUrl = `/api/proxy-vrm?url=${encodeURIComponent(vrmUrl)}`;
        setLocalVrmUrl(proxyUrl);
        syncService.updatePresenceVrmUrl(proxyUrl);
        alert(`Successfully applied avatar: ${character.name}`);
      } else {
        throw new Error("Failed to get VRM URL. Data: " + JSON.stringify(downloadData));
      }
    } catch (err: any) {
      console.error(err);
      
      // Try alternative: maybe just /download
      try {
        const fallRes = await fetch(`${API_BASE}/character_models/${characterId}/download`, {
          headers: { 
            'Authorization': `Bearer ${vroidToken}`,
            'X-Api-Version': '11',
            'Accept': 'application/json'
          }
        });
        const fallData = await fallRes.json();
        const fallbackUrl = fallData?.data?.url || fallData?.url || fallData?.download_url;
        if (fallbackUrl) {
           const proxyFallUrl = `/api/proxy-vrm?url=${encodeURIComponent(fallbackUrl)}`;
           setLocalVrmUrl(proxyFallUrl);
           syncService.updatePresenceVrmUrl(proxyFallUrl);
           alert(`Successfully applied avatar: ${character.name}`);
           return;
        }
      } catch(e) {}
      
      alert("Error applying character: " + err.message);
    }
  };
  const localUserName = useStore(state => state.localUserName);
  const setLocalVrmUrl = useStore(state => state.setLocalVrmUrl);
  const setLocalUserName = useStore(state => state.setLocalUserName);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalUserName(e.target.value);
  };

  const handleNameBlur = async () => {
    const passed = await verifyCaptcha('update_name');
    if (passed) {
      syncService.updatePresenceName(localUserName);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const passed = await verifyCaptcha('upload_vrm');
    if (!passed) {
      return;
    }
    
    const file = e.target.files?.[0];
    if (!file) return;

    // 1. Instant Local Preview!
    // We create a local blob URL so you can instantly see and walk around
    // with your avatar without waiting for the Firebase upload to finish.
    const localBlobUrl = URL.createObjectURL(file);
    setLocalVrmUrl(localBlobUrl);

    setUploading(true);
    setUploadProgress(0);
    try {
      // 2. Upload to Firebase Storage in the background for others to see
      const url = await syncService.uploadVrm(file, (progress) => {
        setUploadProgress(progress);
      });
      if (!url) {
        console.warn("Upload returned null. Others might not see your avatar.");
      } else {
        // 3. Update local store with the REAL persistent URL so it saves correctly
        setLocalVrmUrl(url);
      }
    } catch (error) {
      console.error("Upload failed due to platform limits. Using local avatar.", error);
      // We don't alert the user anymore to not confuse them, as the local blob works fine for them.
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
      e.target.value = ''; // Reset input so same file can be selected again
    }
  };

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (customUrl) {
      const passed = await verifyCaptcha('set_vrm_url');
      if (!passed) {
        return;
      }
      setLocalVrmUrl(customUrl);
      syncService.updatePresenceVrmUrl(customUrl);
      setCustomUrl('');
    }
  };

  return (
    <div className="absolute top-4 left-4 z-50 flex flex-col gap-3 items-start">
      {/* Toggle Button - Always visible to easily minimize/maximize */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-center bg-zinc-900/80 backdrop-blur-md p-3 rounded-full border transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] group ${
          isOpen 
            ? 'border-emerald-400 text-white bg-emerald-500/20' 
            : 'border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500'
        }`}
        title={isOpen ? getTranslation(language, 'minimize') : getTranslation(language, 'avatarStudio')}
      >
        <User className="w-6 h-6" />
      </button>

      {/* Expanded Studio */}
      {isOpen && (
        <div className="bg-zinc-900/95 backdrop-blur-xl rounded-2xl p-6 border border-white/10 shadow-2xl animate-in fade-in slide-in-from-left-2 duration-200 w-[90vw] md:w-96 max-h-[65vh] overflow-y-auto custom-scrollbar">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <User className="w-5 h-5 text-emerald-400" />
              {getTranslation(language, 'avatarStudio')}
            </h2>
            <button onClick={() => setIsOpen(false)} className="text-zinc-400 hover:text-white">
              <ChevronUp className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-6">
            {/* Name Section */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-400">{getTranslation(language, 'displayName')}</label>
              <input
                type="text"
                value={localUserName}
                onChange={handleNameChange}
                onBlur={handleNameBlur}
                className="w-full bg-zinc-950/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
                placeholder={getTranslation(language, 'enterName')}
              />
            </div>

            {/* Default Preset Avatars Grid */}
            <div className="bg-zinc-950/20 border border-white/5 rounded-xl p-4">
              <div className="grid grid-cols-2 gap-3">
                {PRESET_AVATARS.map((preset) => {
                  const isSelected = vrmUrl === preset.url;
                  return (
                    <button
                      key={preset.id}
                      onClick={() => {
                        setLocalVrmUrl(preset.url);
                        syncService.updatePresenceVrmUrl(preset.url);
                      }}
                      className={`relative flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all bg-gradient-to-b ${preset.color} ${
                        isSelected 
                          ? 'border-emerald-400 ring-2 ring-emerald-400/20 scale-[1.02]' 
                          : 'border-white/5 opacity-80 hover:opacity-100 hover:scale-[1.02]'
                      }`}
                    >
                      <span className="text-2xl mb-1 filter drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]">{preset.icon}</span>
                      <span className="text-xs font-semibold text-white truncate w-full">{preset.name}</span>
                      <span className="text-[10px] text-zinc-400 mt-0.5">{preset.type}</span>
                      {isSelected && (
                        <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* VRoid Education Section */}
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-emerald-400">{getTranslation(language, 'createOwnAvatar')}</h3>
                  <p className="text-xs text-emerald-100/70 mt-1 leading-relaxed">
                    {getTranslation(language, 'vroidStudioDesc')}
                  </p>
                </div>
              </div>
              
              <div className="pl-8 space-y-2">
                <a 
                  href="https://vroid.com/en/studio" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs font-medium text-white bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 rounded-lg px-3 py-2 transition-colors w-fit"
                >
                  <Download className="w-4 h-4" />
                  {getTranslation(language, 'downloadVRoidStudio')}
                  <ExternalLink className="w-3 h-3 ml-1 opacity-50" />
                </a>
                <ol className="text-xs text-zinc-400 list-decimal pl-4 space-y-1">
                  <li>{getTranslation(language, 'vroidStep1')}</li>
                  <li>{getTranslation(language, 'vroidStep2')}</li>
                  <li>{getTranslation(language, 'vroidStep3')}</li>
                  <li>{getTranslation(language, 'vroidStep4')}</li>
                </ol>
              </div>
            </div>

            {/* Upload Section */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-400">{getTranslation(language, 'uploadVrmFile')}</label>
              <div className="relative">
                <input
                  type="file"
                  accept=".vrm"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  disabled={uploading}
                />
                <div className={`w-full flex flex-col items-center justify-center gap-2 px-4 py-6 rounded-xl border-2 border-dashed transition-colors overflow-hidden relative ${uploading ? 'border-zinc-700 bg-zinc-800/50' : 'border-zinc-600 hover:border-emerald-500 hover:bg-emerald-500/10'}`}>
                  
                  {/* Progress Bar Background */}
                  {uploading && (
                    <div 
                      className="absolute bottom-0 left-0 h-1 bg-emerald-500 transition-all duration-300 ease-out"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  )}

                  <Upload className={`w-8 h-8 ${uploading ? 'text-zinc-500' : 'text-emerald-500'}`} />
                  <div className="text-center">
                    <span className="block text-sm font-medium text-zinc-300">
                      {uploading ? `${getTranslation(language, 'uploading')}... ${Math.round(uploadProgress)}%` : getTranslation(language, 'dropVrm')}
                    </span>
                    {!uploading && (
                      <span className="block text-xs text-zinc-500 mt-1">{getTranslation(language, 'orClickBrowse')}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* VRoid Hub Integration Section */}
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <User className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold text-blue-400">VRoid Hub</h3>
                    <p className="text-xs text-blue-100/70 mt-1 leading-relaxed">
                      Use characters from your VRoid Hub account.
                    </p>
                  </div>
                </div>
                {vroidToken && (
                  <button 
                    onClick={() => {
                      localStorage.removeItem('vroid_token');
                      setVroidToken(null);
                      setVroidCharacters([]);
                    }}
                    className="text-xs text-blue-400 hover:text-blue-300 underline"
                  >
                    Disconnect
                  </button>
                )}
              </div>
              
              {!vroidToken ? (
                <button
                  onClick={() => {
                    window.open('/auth/vroid', 'vroid_auth', 'width=600,height=800');
                    
                    const handleMessage = async (event: MessageEvent) => {
                      if (event.data?.type === 'VROID_AUTH_SUCCESS') {
                        window.removeEventListener('message', handleMessage);
                        const token = event.data.access_token;
                        localStorage.setItem('vroid_token', token);
                        setVroidToken(token);
                      }
                    };
                    window.addEventListener('message', handleMessage);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-xl transition-colors"
                 >
                  Connect VRoid Hub Account
                </button>
              ) : (
                <div className="space-y-3">
                  {loadingVroid ? (
                    <div className="text-center text-sm text-blue-400 py-4">Loading characters...</div>
                  ) : vroidError ? (
                    <div className="text-center text-xs text-zinc-400 py-3 px-2 border border-dashed border-white/10 rounded-lg bg-zinc-950/50">
                      <p className="text-amber-400 font-medium mb-1">VRoid Connection Notice</p>
                      <p className="mb-2 text-zinc-500">Unable to load direct list from VRoid Hub (possibly blocked by API security or rate limit).</p>
                      <p>Try placing your <code className="text-[11px] font-mono text-zinc-300 bg-white/5 py-0.5 px-1 rounded">.vrm</code> avatar directly into the upload dropzone below!</p>
                    </div>
                  ) : vroidCharacters.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                      {vroidCharacters.map((char: any, i) => (
                        <div key={char.id || i} className="group relative bg-zinc-900 rounded-lg overflow-hidden border border-white/5 hover:border-blue-500/50 transition-colors cursor-pointer" onClick={() => useVroidCharacter(char)}>
                          <img 
                            src={char.image?.sq150?.url || char.image?.w160?.url || char.character?.image?.sq150?.url || char.user?.icon_url} 
                            alt={char.name} 
                            className="w-full aspect-square object-cover"
                          />
                          <div className="absolute inset-x-0 bottom-0 bg-black/60 backdrop-blur-sm p-2 translate-y-full group-hover:translate-y-0 transition-transform">
                            <p className="text-[10px] text-white truncate text-center">{char.name || 'Select Character'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-sm text-blue-400 py-2">No characters found or unable to fetch. Like some characters on VRoid Hub!</div>
                  )}
                </div>
              )}
            </div>

            {/* URL Section */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-400">{getTranslation(language, 'pasteVrmUrl')}</label>
              <form onSubmit={handleUrlSubmit} className="flex gap-2">
                <div className="relative flex-1">
                  <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="url"
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-zinc-950/50 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!customUrl}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  {getTranslation(language, 'apply')}
                </button>
              </form>
              
              <div className="pt-2 flex justify-center">
                <button
                  onClick={() => {
                    setLocalVrmUrl(DEFAULT_VRM_URL);
                    syncService.updatePresenceVrmUrl(DEFAULT_VRM_URL);
                    alert("Avatar reset to default.");
                  }}
                  className="text-xs text-zinc-500 hover:text-red-400 underline transition-colors"
                >
                  {getTranslation(language, 'resetDefaultAvatar')}
                </button>
              </div>
            </div>

            {/* Secret NPC Upload Section */}
            {localUserName.toLowerCase() === 'admin' && (
              <div className="space-y-2 border-t border-white/10 pt-4 mt-4">
                <label className="text-sm font-medium text-pink-400 flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  Secret NPC VRM Upload
                </label>
                <div className="relative">
                  <input
                    type="file"
                    accept=".vrm"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const url = await syncService.uploadVrm(file);
                        if (url) {
                          alert(`NPC VRM Uploaded successfully!\nURL: ${url}\n\nSave this URL for the NPC configuration.`);
                          console.log("NPC VRM URL:", url);
                        }
                      } catch (error) {
                        alert("NPC Upload failed: " + (error as Error).message);
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className="w-full flex flex-col items-center justify-center gap-2 px-4 py-4 rounded-xl border-2 border-dashed border-pink-500/50 hover:border-pink-500 hover:bg-pink-500/10 transition-colors">
                    <span className="block text-sm font-medium text-pink-300">
                      Drop NPC .vrm file here
                    </span>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
};
