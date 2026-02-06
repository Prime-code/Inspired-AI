import React, { useEffect, useState, useRef } from 'react';
import { VerseData, SessionStatus } from '../types';

interface DisplayScreenProps {
  verse: VerseData | null;
  status: SessionStatus;
  onReadAloud: () => void;
  isReading: boolean;
  activeWordIndex?: number;
  isLocked?: boolean;
  onToggleLock?: () => void;
}

const DisplayScreen: React.FC<DisplayScreenProps> = ({ 
  verse, 
  status, 
  onReadAloud, 
  isReading, 
  activeWordIndex = -1,
  isLocked = false,
  onToggleLock
}) => {
  const isListening = status === SessionStatus.LISTENING;
  const [showSweep, setShowSweep] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Automatic Smooth Scroll to Top on Verse Change
  useEffect(() => {
    if (verse) {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
      setShowSweep(true);
      const timer = setTimeout(() => setShowSweep(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [verse?.reference]);

  // Dynamic Font Size Calculation
  const getDynamicFontSize = (text: string) => {
    const len = text.length;
    if (len < 50) return 'clamp(2.5rem, 8vw, 5.5rem)';
    if (len < 100) return 'clamp(2rem, 6vw, 4.5rem)';
    if (len < 200) return 'clamp(1.5rem, 5vw, 3.5rem)';
    if (len < 400) return 'clamp(1.2rem, 4vw, 2.8rem)';
    return 'clamp(1rem, 3.5vw, 2.2rem)';
  };

  const words = verse?.text.split(/\s+/) || [];

  return (
    <div className={`flex-1 w-full relative overflow-hidden rounded-[2.5rem] border transition-all duration-700 flex flex-col ${
      isListening 
        ? 'border-[#a34981]/30 bg-[#08080a] shadow-[0_0_80px_-20px_rgba(163,73,129,0.15)]' 
        : 'border-zinc-800/40 bg-[#0d0d0f]'
    }`}>
      
      {/* TWC Logo - Top Right */}
      <div className="absolute top-8 right-8 z-30 opacity-80 hover:opacity-100 transition-opacity">
        <img 
          src="https://res.cloudinary.com/dyd911fv0/image/upload/v1740050731/twc_logo_clean_vpsf3v.png" 
          alt="TWC Logo" 
          className="w-12 h-auto md:w-16 mix-blend-screen"
          onError={(e) => (e.currentTarget.style.display = 'none')}
        />
      </div>

      {/* Lock Button - Top Left */}
      {verse && (
        <div className="absolute top-8 left-8 z-30">
          <button 
            onClick={onToggleLock}
            className={`flex items-center space-x-2 px-4 py-2 rounded-full border transition-all duration-300 ${
              isLocked 
                ? 'bg-[#a34981] border-[#a34981]/50 text-white shadow-[0_0_20px_rgba(163,73,129,0.3)]' 
                : 'bg-black/40 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {isLocked ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
              )}
            </svg>
            <span className="text-[10px] font-black uppercase tracking-widest">{isLocked ? 'Locked' : 'Lock'}</span>
          </button>
        </div>
      )}

      {/* Brand Flare Sweep */}
      {showSweep && (
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#a34981]/20 to-transparent light-sweep w-[60%] h-full"></div>
        </div>
      )}

      {/* Continuous Tracking Indicator */}
      {isListening && verse && (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center space-y-2 pointer-events-none">
          <div className="flex items-center space-x-2 px-4 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-[#a34981]/20">
            <div className={`w-1.5 h-1.5 rounded-full ${isLocked ? 'bg-zinc-600' : 'bg-[#a34981] animate-pulse'}`}></div>
            <span className={`text-[10px] font-black uppercase tracking-[0.3em] ${isLocked ? 'text-zinc-600' : 'text-[#a34981]'}`}>
              {isLocked ? 'Stationary' : 'Tracking Flow'}
            </span>
          </div>
        </div>
      )}

      {/* Main Verse Content */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 flex flex-col relative z-10 overflow-y-auto scrollbar-hide px-6 py-20 sm:px-16"
      >
        <div className="min-h-full flex flex-col items-center justify-center text-center">
          {verse ? (
            <div key={verse.reference} className="text-reveal w-full max-w-5xl mx-auto space-y-12">
              <div className="inline-flex items-center space-x-4">
                <div className="h-px w-8 bg-[#a34981]/40"></div>
                <span className="text-[#a34981] text-[11px] sm:text-xs font-black tracking-[0.4em] uppercase">
                  {verse.translation}
                </span>
                <div className="h-px w-8 bg-[#a34981]/40"></div>
              </div>
              
              <div className="relative">
                <div 
                  className="font-serif italic leading-[1.35] tracking-tight transition-all duration-700"
                  style={{ fontSize: getDynamicFontSize(verse.text) }}
                >
                  "
                  {words.map((word, i) => (
                    <span 
                      key={i} 
                      className={`transition-all duration-300 inline-block mx-[0.15em] ${
                        activeWordIndex === i 
                          ? 'text-white scale-110 drop-shadow-[0_0_15px_rgba(163,73,129,0.8)]' 
                          : activeWordIndex > i ? 'text-zinc-600' : 'text-zinc-200'
                      }`}
                    >
                      {word}
                    </span>
                  ))}
                  "
                </div>
              </div>

              <div className="flex flex-col items-center space-y-8 pb-12">
                <div className="h-px w-40 bg-gradient-to-r from-transparent via-zinc-800 to-transparent"></div>
                <p className="font-bold text-zinc-500 tracking-[0.3em] uppercase transition-colors"
                   style={{ fontSize: 'clamp(1rem, 2.5vw, 1.5rem)' }}>
                  {verse.reference}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center space-y-12">
               <div className={`relative transition-all duration-1000 ${isListening ? 'scale-110' : 'scale-90 opacity-20'}`}>
                 <div className={`absolute inset-0 bg-[#a34981]/10 blur-[80px] rounded-full transition-opacity duration-1000 ${isListening ? 'opacity-100' : 'opacity-0'}`}></div>
                 <svg xmlns="http://www.w3.org/2000/svg" className={`h-24 w-24 sm:h-40 sm:w-40 transition-colors duration-1000 ${isListening ? 'text-[#a34981]/50' : 'text-zinc-700'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={0.3} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                 </svg>
               </div>
               <div className="space-y-4">
                 <p className={`text-[12px] font-black tracking-[0.6em] uppercase transition-colors duration-500 ${isListening ? 'text-[#a34981]' : 'text-zinc-800'}`}>
                   {isListening ? "Sonic Engine Ready" : "System Idle"}
                 </p>
               </div>
            </div>
          )}
        </div>
      </div>

      {/* Brand-colored Recite Button */}
      {verse && (
        <div className="absolute bottom-10 right-10 z-30">
           <button 
            onClick={onReadAloud}
            disabled={isReading}
            className={`group flex items-center space-x-3 px-10 py-5 rounded-3xl border transition-all duration-500 shadow-2xl active:scale-95 ${
              isReading 
                ? 'bg-[#a34981] text-white border-[#a34981]/50 opacity-100' 
                : 'bg-black/60 backdrop-blur-2xl border-zinc-800 text-zinc-400 hover:border-[#a34981]/50 hover:text-white'
            }`}
          >
            {isReading ? (
              <div className="flex space-x-1.5 items-end">
                <div className="w-1.5 h-4 bg-white rounded-full animate-wave"></div>
                <div className="w-1.5 h-6 bg-white rounded-full animate-wave animation-delay-100"></div>
                <div className="w-1.5 h-5 bg-white rounded-full animate-wave animation-delay-200"></div>
              </div>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 transition-transform group-hover:scale-110" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                 <path d="M11 5L6 9H2V15H6L11 19V5Z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                 <path d="M19.07 4.93C20.9447 6.80528 21.9979 9.34836 21.9979 12C21.9979 14.6516 20.9447 17.1947 19.07 19.07" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            <span className="text-[11px] font-black tracking-[0.25em] uppercase">{isReading ? 'Reading' : 'Recite'}</span>
          </button>
        </div>
      )}

      {/* Animated Sync Line */}
      {isListening && !isLocked && (
        <div className="h-[3px] w-full bg-[#a34981]/5 flex">
           <div className="h-full bg-[#a34981]/40 animate-[light-sweep_4s_linear_infinite] w-1/4 blur-[1px]"></div>
        </div>
      )}
    </div>
  );
};

export default DisplayScreen;