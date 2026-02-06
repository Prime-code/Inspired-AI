import React, { useEffect, useState, useRef } from 'react';
import { VerseData, SessionStatus } from '../types';
import IWCLogo from './IWCLogo';

interface DisplayScreenProps {
  verse: VerseData | null;
  status: SessionStatus;
  onReadAloud: () => void;
  isReading: boolean;
  activeWordIndex?: number;
  isLocked?: boolean;
  onToggleLock?: () => void;
  audioVolume?: number;
}

const DisplayScreen: React.FC<DisplayScreenProps> = ({ 
  verse, 
  status, 
  onReadAloud, 
  isReading, 
  activeWordIndex = -1,
  isLocked = false,
  onToggleLock,
  audioVolume = 0
}) => {
  const isListening = status === SessionStatus.LISTENING;
  const [showSweep, setShowSweep] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (verse) {
      if (scrollAreaRef.current) {
        scrollAreaRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
      setShowSweep(true);
      const timer = setTimeout(() => setShowSweep(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [verse?.reference]);

  // Refined font scaling for "perfect fit"
  const getDynamicFontSize = (text: string) => {
    const len = text.length;
    if (len < 60) return 'clamp(2.4rem, 6vw, 4.8rem)';
    if (len < 120) return 'clamp(1.8rem, 5vw, 3.8rem)';
    if (len < 250) return 'clamp(1.4rem, 4vw, 2.8rem)';
    if (len < 500) return 'clamp(1.1rem, 3.2vw, 2.2rem)';
    return 'clamp(0.95rem, 2.8vw, 1.8rem)';
  };

  const words = verse?.text.split(/\s+/) || [];
  const bars = Array.from({ length: 13 });

  return (
    <div className={`flex-1 w-full relative overflow-hidden rounded-[2.5rem] border transition-all duration-700 flex flex-col min-h-0 ${
      isListening 
        ? 'border-[#a34981]/40 bg-[#070708] shadow-[0_0_100px_-20px_rgba(163,73,129,0.2)]' 
        : 'border-zinc-800/50 bg-[#0a0a0c]'
    }`}>
      
      {/* Brand Corner - IWC Logo */}
      <div className="absolute top-6 right-8 z-30 opacity-70 pointer-events-none">
        <IWCLogo className="w-12 h-12" />
      </div>

      {/* Control Corner - Lock Toggle */}
      {verse && (
        <div className="absolute top-6 left-8 z-30">
          <button 
            onClick={onToggleLock}
            className={`flex items-center space-x-3 px-4 py-2 rounded-full border transition-all duration-500 active:scale-95 group ${
              isLocked 
                ? 'bg-[#a34981] border-[#a34981]/40 text-white shadow-lg' 
                : 'bg-black/40 border-zinc-800 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-3.5 w-3.5 transition-transform duration-500 ${isLocked ? 'scale-110' : 'group-hover:rotate-12'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {isLocked ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
              )}
            </svg>
            <span className="text-[9px] font-black uppercase tracking-[0.2em]">{isLocked ? 'Locked' : 'Unlock'}</span>
          </button>
        </div>
      )}

      {/* Status & Feedback - Centered Top */}
      {isListening && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center space-y-4 pointer-events-none">
          <div className="flex items-center space-x-2 px-3 py-1 rounded-full bg-black/60 backdrop-blur-xl border border-[#a34981]/20">
            <div className={`w-1 h-1 rounded-full ${isLocked ? 'bg-zinc-700' : 'bg-[#a34981] animate-pulse'}`}></div>
            <span className={`text-[8px] font-black uppercase tracking-[0.4em] ${isLocked ? 'text-zinc-600' : 'text-[#a34981]'}`}>
              {isLocked ? 'Stationary' : 'IWC Tracking'}
            </span>
          </div>
          
          {/* Audio Waveform */}
          {!isLocked && (
            <div className="flex items-end justify-center space-x-1 h-5 overflow-hidden">
              {bars.map((_, i) => {
                const centerOffset = Math.abs(i - 6);
                const multiplier = 1 - (centerOffset * 0.12);
                const height = Math.max(2, audioVolume * 180 * multiplier);
                return (
                  <div 
                    key={i} 
                    className="w-0.5 rounded-full bg-[#a34981] transition-all duration-75"
                    style={{ 
                      height: `${height}px`, 
                      opacity: 0.15 + (audioVolume * 2.5),
                      boxShadow: audioVolume > 0.05 ? '0 0 8px #a34981' : 'none'
                    }}
                  ></div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Main Content Scroll Area */}
      <div 
        ref={scrollAreaRef}
        className="flex-1 flex flex-col relative z-10 overflow-y-auto scrollbar-hide px-6 py-20 sm:px-12 md:px-20 min-h-0"
      >
        <div className="min-h-full flex flex-col items-center justify-center text-center">
          {verse ? (
            <div key={verse.reference} className="text-reveal w-full max-w-4xl mx-auto flex flex-col items-center space-y-8 md:space-y-12">
              
              {/* Header: Translation */}
              <div className="flex items-center space-x-4">
                <div className="h-px w-6 bg-[#a34981]/30"></div>
                <span className="text-[#a34981] text-[9px] sm:text-xs font-black tracking-[0.6em] uppercase">
                  {verse.translation}
                </span>
                <div className="h-px w-6 bg-[#a34981]/30"></div>
              </div>
              
              {/* Body: Verse Text */}
              <div className="w-full">
                <div 
                  className="font-serif italic leading-[1.3] tracking-tight transition-all duration-700 text-zinc-50"
                  style={{ fontSize: getDynamicFontSize(verse.text) }}
                >
                  <span className="text-[#a34981]/50 mr-2 text-[1.2em]">"</span>
                  {words.map((word, i) => (
                    <span 
                      key={i} 
                      className={`transition-all duration-300 inline-block mx-[0.1em] ${
                        activeWordIndex === i 
                          ? 'text-white scale-105 drop-shadow-[0_0_15px_rgba(163,73,129,0.8)]' 
                          : activeWordIndex > i ? 'text-zinc-600' : 'text-zinc-200'
                      }`}
                    >
                      {word}
                    </span>
                  ))}
                  <span className="text-[#a34981]/50 ml-1 text-[1.2em]">"</span>
                </div>
              </div>

              {/* Footer: Reference */}
              <div className="flex flex-col items-center space-y-4 pt-4">
                <div className="h-px w-24 bg-gradient-to-r from-transparent via-[#a34981]/20 to-transparent"></div>
                <p className="font-bold text-zinc-500 tracking-[0.5em] uppercase"
                   style={{ fontSize: 'clamp(0.9rem, 1.8vw, 1.3rem)' }}>
                  {verse.reference}
                </p>
              </div>

            </div>
          ) : (
            <div className="flex flex-col items-center space-y-10">
               <div className={`relative transition-all duration-1000 ${isListening ? 'scale-110' : 'scale-90 opacity-20'}`}>
                 <div className={`absolute inset-0 bg-[#a34981]/10 blur-[80px] rounded-full transition-opacity duration-1000 ${isListening ? 'opacity-100' : 'opacity-0'}`}></div>
                 <svg xmlns="http://www.w3.org/2000/svg" className={`h-24 w-24 sm:h-36 sm:w-36 transition-colors duration-1000 ${isListening ? 'text-[#a34981]/40' : 'text-zinc-800'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={0.3} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                 </svg>
               </div>
               <p className={`text-[9px] font-black tracking-[0.8em] uppercase transition-colors duration-700 ${isListening ? 'text-[#a34981]' : 'text-zinc-900'}`}>
                 {isListening ? "Waiting for Word" : "IWC AI Inactive"}
               </p>
            </div>
          )}
        </div>
      </div>

      {/* Action Overlay: Recite Button */}
      {verse && (
        <div className="absolute bottom-8 right-8 z-30">
           <button 
            onClick={onReadAloud}
            disabled={isReading}
            className={`flex items-center space-x-3 px-6 py-3.5 rounded-2xl border transition-all duration-500 shadow-2xl active:scale-95 ${
              isReading 
                ? 'bg-[#a34981] text-white border-[#a34981]/30 shadow-[#a34981]/20' 
                : 'bg-black/80 backdrop-blur-2xl border-zinc-800 text-zinc-400 hover:border-[#a34981]/40 hover:text-zinc-100'
            }`}
          >
            {isReading ? (
              <div className="flex space-x-1 items-end h-3">
                <div className="w-0.5 bg-white rounded-full animate-wave"></div>
                <div className="w-0.5 bg-white rounded-full animate-wave animation-delay-100"></div>
                <div className="w-0.5 bg-white rounded-full animate-wave animation-delay-200"></div>
              </div>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                 <path d="M11 5L6 9H2V15H6L11 19V5Z" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                 <path d="M19.07 4.93C20.9447 6.80528 21.9979 9.34836 21.9979 12C21.9979 14.6516 20.9447 17.1947 19.07 19.07" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            <span className="text-[9px] font-black tracking-[0.2em] uppercase">{isReading ? 'Reading' : 'Recite'}</span>
          </button>
        </div>
      )}

      {/* Ambient Floor Effect */}
      {isListening && !isLocked && (
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-[#a34981]/5 overflow-hidden">
           <div className="h-full bg-[#a34981]/40 animate-[light-sweep_2.5s_linear_infinite] w-1/3 blur-[1px]"></div>
        </div>
      )}
    </div>
  );
};

export default DisplayScreen;