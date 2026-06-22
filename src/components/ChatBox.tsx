import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, Mic, MicOff } from 'lucide-react';
import { useStore } from '../store/useStore';
import { syncService } from '../services/sync';
import { getTranslation } from '../utils/translations';

const languageToSpeechLocale: Record<string, string> = {
  en: 'en-US',
  es: 'es-ES',
  ja: 'ja-JP',
  fr: 'fr-FR',
  de: 'de-DE',
  pt: 'pt-BR',
  it: 'it-IT',
  ko: 'ko-KR',
  zh: 'zh-CN',
  ru: 'ru-RU'
};

export const ChatBox: React.FC = () => {
  const language = useStore(state => state.language);
  const voiceLanguage = useStore(state => state.voiceLanguage);
  const [text, setText] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Helper to determine the speech locale depending on user settings
  const getSpeechLocale = () => {
    if (voiceLanguage === 'auto') {
      return typeof navigator !== 'undefined' ? (navigator.language || 'en-US') : 'en-US';
    }
    return languageToSpeechLocale[voiceLanguage] || 'en-US';
  };

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = getSpeechLocale();

      rec.onstart = () => {
        setIsListening(true);
      };

      rec.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setText(prev => {
            const spacing = prev && !prev.endsWith(' ') ? ' ' : '';
            return prev + spacing + transcript;
          });
        }
      };

      rec.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
    }
  }, [language, voiceLanguage]);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      console.warn("Speech recognition is not supported in this browser.");
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      try {
        // Synchronize selected speech language setting from state immediately
        recognitionRef.current.lang = getSpeechLocale();
        recognitionRef.current.start();
      } catch (err) {
        console.warn("SpeechRec start error:", err);
      }
    }
  };

  const messages = useStore(state => state.messages);
  const localUserId = useStore(state => state.localUserId);
  const isFirstPerson = useStore(state => state.isFirstPerson);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  // Global keydown listener to open chat on 'Enter' keypress
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if other inputs or textareas are already focused
      const activeEl = document.activeElement;
      if (
        activeEl && 
        (activeEl.tagName === 'INPUT' || 
         activeEl.tagName === 'TEXTAREA' || 
         activeEl.getAttribute('contenteditable') === 'true')
      ) {
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        setIsOpen(true);
        // Release pointer lock so the user can click and view the UI
        try {
          if (document.pointerLockElement) {
            document.exitPointerLock();
          }
        } catch (err) {
          console.warn('Failed to exit pointer lock:', err);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, []);

  // Autofocus input when chat box is opened
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const messageText = text.trim();
    if (messageText) {
      syncService.broadcastChatMessage(messageText);
    }
    setText('');

    if (isFirstPerson) {
      setIsOpen(false);
      // Re-engage pointer lock seamlessly
      setTimeout(() => {
        const canvas = document.querySelector('canvas');
        if (canvas) {
          try {
            canvas.requestPointerLock();
          } catch (err) {
            console.warn('Failed to re-engage pointer lock after chat:', err);
          }
        }
      }, 50);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="absolute bottom-4 right-4 z-50 bg-pink-600/80 backdrop-blur-md p-4 rounded-full border border-pink-500/50 shadow-[0_0_15px_rgba(236,72,153,0.3)] hover:bg-pink-500 transition-colors text-white"
        title={getTranslation(language, 'worldChat')}
      >
        <MessageSquare className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div className="absolute bottom-4 right-4 z-50 w-[calc(100vw-2rem)] md:w-80 bg-zinc-900/40 backdrop-blur-sm rounded-2xl border border-white/10 shadow-xl flex flex-col overflow-hidden transition-all h-80 md:h-96">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10 bg-zinc-900/30">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          {getTranslation(language, 'worldChat')}
        </h3>
        <button 
          onClick={() => setIsOpen(false)}
          className="text-zinc-400 hover:text-white transition-colors"
        >
          &times;
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {messages.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center italic mt-4">{getTranslation(language, 'noMessages')}</p>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === localUserId;
            return (
              <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <span className="text-[10px] text-zinc-400 mb-1 px-1">
                  {isMe ? getTranslation(language, 'you') : msg.senderName || `User ${msg.senderId.slice(0, 4)}`}
                </span>
                <div 
                  className={`px-3 py-2 rounded-2xl max-w-[85%] text-sm ${
                    isMe 
                      ? 'bg-emerald-600/80 text-white rounded-tr-sm' 
                      : 'bg-zinc-800/60 text-zinc-200 rounded-tl-sm border border-white/5'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="p-3 border-t border-white/10 bg-zinc-900/30 flex gap-2 items-center">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setIsOpen(false);
              if (isFirstPerson) {
                setTimeout(() => {
                  const canvas = document.querySelector('canvas');
                  canvas?.requestPointerLock();
                }, 50);
              }
            }
          }}
          placeholder={isListening ? getTranslation(language, 'listening') : getTranslation(language, 'typeAMessage')}
          className="flex-1 bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-colors placeholder:text-zinc-500"
        />
        {typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) && (
          <button
            type="button"
            onClick={toggleListening}
            className={`p-2 rounded-xl border transition-all flex items-center justify-center h-9 w-9 shrink-0 ${
              isListening
                ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse'
                : 'bg-zinc-800/40 hover:bg-zinc-700/40 border-white/10 text-zinc-400 hover:text-white'
            }`}
            title={isListening ? "Stop listening" : "Speak (Auto-detect Language)"}
          >
            {isListening ? (
              <Mic className="w-4 h-4 text-red-500 animate-pulse animate-duration-1000" />
            ) : (
              <Mic className="w-4 h-4" />
            )}
          </button>
        )}
        <button
          type="submit"
          disabled={!text.trim() && !isListening}
          className="bg-emerald-600/80 hover:bg-emerald-500/80 disabled:bg-zinc-800/50 disabled:text-zinc-500 text-white p-2 rounded-xl transition-colors flex items-center justify-center h-9 w-9 shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
