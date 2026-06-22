import React, { useState } from 'react';
import { Info, X, Code, Globe, Heart, Cpu, Database, Box, FlaskConical, Sparkles } from 'lucide-react';
import { useStore } from '../store/useStore';

export const Credits = () => {
  const [isOpen, setIsOpen] = useState(false);
  const isAvatarStudioOpen = useStore(state => state.isAvatarStudioOpen);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`absolute top-[72px] left-4 bg-zinc-900/80 backdrop-blur-md p-3 rounded-full border border-white/10 hover:bg-zinc-800 transition-all shadow-lg text-white hover:border-white/20 duration-300 ${
          isAvatarStudioOpen 
            ? 'opacity-0 scale-95 pointer-events-none z-0' 
            : 'opacity-100 scale-100 pointer-events-auto z-40'
        }`}
        title="Credits & Info"
      >
        <Info className="w-6 h-6" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-950 border border-white/10 rounded-2xl p-0 w-[500px] max-w-[90%] shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-zinc-900/50 p-6 border-b border-white/5 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                  <Code className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">System Credits</h2>
                  <p className="text-xs text-zinc-400">Architecture & Acknowledgements</p>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-white/5 rounded-full transition-colors text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
              
              {/* Core Tech Stack */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                  <Cpu className="w-4 h-4" /> Core Technology
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <CreditItem title="Three.js" desc="3D Rendering Engine" />
                  <CreditItem title="React Three Fiber" desc="React Renderer for Three.js" />
                  <CreditItem title="Rapier Physics" desc="Real-time Physics Engine" />
                  <CreditItem title="PeerJS" desc="WebRTC P2P Networking" />
                  <CreditItem title="Firebase" desc="Backend & Signaling" />
                  <CreditItem title="Zustand" desc="State Management" />
                </div>
              </div>

              {/* Standards */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                  <Globe className="w-4 h-4 text-sky-400" /> Standards & Protocols
                </h3>
                <div className="bg-zinc-900/50 rounded-xl p-4 border border-white/5 space-y-4">
                  <div className="flex items-start gap-3">
                    <Box className="w-5 h-5 text-blue-400 mt-1 flex-shrink-0" />
                    <div>
                      <h4 className="text-white font-medium">VRM Standard by Pixiv & VRMC</h4>
                      <p className="text-sm text-zinc-400 mt-1 leading-relaxed font-light">
                        Extending deep gratitude to <strong>Pixiv Inc.</strong> and the <strong>VRM Consortium</strong> for establishing and promoting the open, platform-independent 3D humanoid avatar file format standard (VRM) that forms the foundation of our virtual companion and custom-skinned avatar pipelines.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Experimental Sandbox */}
              <div className="space-y-3 font-sans">
                <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-amber-500 animate-pulse" /> Experimental Sandbox
                </h3>
                <div className="grid grid-cols-1 gap-3">
                  <div className="bg-zinc-900/40 p-3.5 rounded-lg border border-amber-500/10 hover:border-amber-500/20 transition-all">
                    <div className="flex items-center gap-2 text-amber-400 font-medium text-sm">
                      <Sparkles className="w-4 h-4" />
                      <span>Next-Gen WebGPU Renderer</span>
                    </div>
                    <div className="text-zinc-400 text-xs mt-1 leading-relaxed">
                      High-throughput graphics pipeline supporting experimental parallel mesh compilation, forward-plus lighting calculations, and fast-fallback procedural capsules for uncompiled geometries on capable hardware.
                    </div>
                  </div>
                  
                  <div className="bg-zinc-900/40 p-3.5 rounded-lg border border-amber-500/10 hover:border-amber-500/20 transition-all">
                    <div className="flex items-center gap-2 text-indigo-400 font-medium text-sm">
                      <Cpu className="w-4 h-4" />
                      <span>Real-Time Voicebone Harmonics</span>
                    </div>
                    <div className="text-zinc-400 text-xs mt-1 leading-relaxed">
                      Experimental soundwave-driven vertex displacement capturing custom microphone audio peaks to animate model mesh joints, mouth phonemes, and head transforms dynamically.
                    </div>
                  </div>

                  <div className="bg-zinc-900/40 p-3.5 rounded-lg border border-amber-500/10 hover:border-amber-500/20 transition-all">
                    <div className="flex items-center gap-2 text-sky-400 font-medium text-sm">
                      <Database className="w-4 h-4" />
                      <span>Generative Environment Synthesis</span>
                    </div>
                    <div className="text-zinc-400 text-xs mt-1 leading-relaxed">
                      Multimodal neural generator integration allowing real-time AI-prompted rendering of custom skybox panoramas to completely alter the spatial environment on-the-fly.
                    </div>
                  </div>
                </div>
              </div>

              {/* Special Thanks */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                  <Heart className="w-4 h-4 text-rose-500" /> Special Thanks
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between bg-zinc-900/30 p-3 rounded-lg border border-white/5">
                    <span className="text-zinc-200 text-sm">Pixiv Inc.</span>
                    <span className="text-xs text-rose-400 bg-rose-500/10 px-2 py-1 rounded">Avatar Tech & Creators</span>
                  </div>
                  <div className="flex items-center justify-between bg-zinc-900/30 p-3 rounded-lg border border-white/5">
                    <span className="text-zinc-200 text-sm">@pixiv/three-vrm Contributors</span>
                    <span className="text-xs text-sky-400 bg-sky-500/10 px-2 py-1 rounded">WebGL Loaders</span>
                  </div>
                  <div className="flex items-center justify-between bg-zinc-900/30 p-3 rounded-lg border border-white/5">
                    <span className="text-zinc-200 text-sm">Gaming2Gamers</span>
                    <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded">Platform Host</span>
                  </div>
                  <div className="flex items-start justify-between bg-zinc-900/30 p-3 rounded-lg border border-white/5">
                    <div>
                      <span className="text-zinc-200 text-sm block">Cartwheel</span>
                      <a href="https://getcartwheel.com/" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">getcartwheel.com</a>
                    </div>
                    <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded">Motion Data</span>
                  </div>
                  <div className="flex items-center justify-between bg-zinc-900/30 p-3 rounded-lg border border-white/5">
                    <span className="text-zinc-200 text-sm">Gemma (AI Assistant)</span>
                    <span className="text-xs text-purple-400 bg-purple-500/10 px-2 py-1 rounded">Lead Architect</span>
                  </div>
                  <div className="flex items-center justify-between bg-zinc-900/30 p-3 rounded-lg border border-white/5">
                    <span className="text-zinc-200 text-sm">Shane</span>
                    <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-1 rounded">Visionary</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="p-4 bg-zinc-900/80 border-t border-white/5 text-center">
              <p className="text-[10px] text-zinc-500">
                Built with ❤️ using React, TypeScript, and Gemini 2.0 Flash
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const CreditItem = ({ title, desc }: { title: string, desc: string }) => (
  <div className="bg-zinc-900/50 p-3 rounded-lg border border-white/5 hover:border-white/10 transition-colors">
    <div className="text-emerald-400 font-medium text-sm">{title}</div>
    <div className="text-zinc-500 text-xs">{desc}</div>
  </div>
);
