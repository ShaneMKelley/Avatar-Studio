import React, { useState } from 'react';
import { Wand2, Image as ImageIcon, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import { generateEnvironment } from '../services/ai';

export const SkyboxGenerator = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const setLocalSkybox = useStore(state => state.setLocalSkybox);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || generating) return;

    setGenerating(true);
    try {
      const imageUrl = await generateEnvironment(prompt);
      setLocalSkybox(imageUrl);
      setIsOpen(false);
    } catch (err) {
      console.error(err);
      alert("Failed to generate environment.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="absolute top-20 left-4 z-20 bg-zinc-900/40 backdrop-blur-sm p-3 rounded-full border border-white/10 hover:bg-zinc-800/60 transition-colors text-white shadow-xl"
        title="AI Environment Generator"
      >
        <ImageIcon className="w-5 h-5 text-purple-400" />
      </button>

      {isOpen && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 w-96 max-w-[90%] shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-purple-400" />
                AI Skybox
              </h2>
              <button onClick={() => setIsOpen(false)} className="text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGenerate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  Describe your environment
                </label>
                <input
                  type="text"
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="e.g. Cyberpunk city skyline at night..."
                  className="w-full bg-zinc-950/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500/50 transition-colors"
                />
                <p className="text-xs text-zinc-500 mt-2">
                  Uses Gemini to generate a custom 360° panoramic background for your lounge. This is local to you.
                </p>
              </div>
              
              <button
                type="submit"
                disabled={generating || !prompt.trim()}
                className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white px-4 py-3 rounded-xl font-medium transition-colors"
              >
                {generating ? (
                  <>
                    <Wand2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <ImageIcon className="w-4 h-4" />
                    Generate
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
