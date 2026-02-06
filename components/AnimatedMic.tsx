import React from 'react';
import { SessionStatus } from '../types';

interface AnimatedMicProps {
  status: SessionStatus;
  onClick: () => void;
}

const AnimatedMic: React.FC<AnimatedMicProps> = ({ status, onClick }) => {
  const isListening = status === SessionStatus.LISTENING;
  const isConnecting = status === SessionStatus.CONNECTING;

  return (
    <div className="relative flex flex-col items-center justify-center pt-2 pb-6">
      <div className="relative group cursor-pointer" onClick={onClick}>
        {/* Compact Purple Glow */}
        {isListening && (
          <div className="absolute inset-0 rounded-full bg-[#a34981]/30 pulse-animation scale-150 blur-2xl"></div>
        )}
        
        <div className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl ${
          isListening 
            ? 'bg-[#a34981] ring-8 ring-[#a34981]/20' 
            : isConnecting 
              ? 'bg-zinc-800 animate-pulse'
              : 'bg-zinc-900 ring-1 ring-zinc-800 hover:scale-105 active:scale-95'
        }`}>
          {isListening ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <rect x="9" y="4" width="6" height="12" rx="3" strokeWidth={2.5} />
              <path d="M5 11a7 7 0 0014 0" strokeWidth={2.5} />
              <line x1="12" y1="18" x2="12" y2="21" strokeWidth={2.5} />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-[#a34981]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          )}
        </div>
      </div>
      
      <div className="mt-5 flex flex-col items-center space-y-1">
        <p className="text-[10px] font-black tracking-[0.4em] uppercase transition-all duration-300">
          {status === SessionStatus.IDLE && <span className="text-zinc-700">Connect Session</span>}
          {status === SessionStatus.CONNECTING && <span className="text-[#a34981]/60">Syncing...</span>}
          {status === SessionStatus.LISTENING && <span className="text-[#a34981] animate-pulse">Live Listening</span>}
          {status === SessionStatus.ERROR && <span className="text-red-900">Link Severed</span>}
        </p>
      </div>
    </div>
  );
};

export default AnimatedMic;