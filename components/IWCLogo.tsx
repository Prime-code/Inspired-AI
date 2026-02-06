import React from 'react';

interface IWCLogoProps {
  className?: string;
}

const IWCLogo: React.FC<IWCLogoProps> = ({ className = "w-12 h-12" }) => {
  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_0_15px_rgba(163,73,129,0.3)]">
        {/* Outer Ring of Inspiration */}
        <circle cx="50" cy="50" r="48" fill="none" stroke="#a34981" strokeWidth="1" className="opacity-20" />
        <circle cx="50" cy="50" r="45" fill="none" stroke="#a34981" strokeWidth="0.5" className="opacity-10" />
        
        {/* The "IWC" Typography - Serif and Bold */}
        <text 
          x="50%" 
          y="58%" 
          textAnchor="middle" 
          fill="white" 
          style={{ 
            fontFamily: "'Playfair Display', serif", 
            fontWeight: 800, 
            fontSize: '28px',
            letterSpacing: '-1px'
          }}
        >
          IWC
        </text>
        
        {/* Abstract "Inspired" Arc */}
        <path 
          d="M 30 75 Q 50 85 70 75" 
          fill="none" 
          stroke="#a34981" 
          strokeWidth="3" 
          strokeLinecap="round"
          className="opacity-80 shadow-inner"
        />
        
        {/* Glow point */}
        <circle cx="50" cy="22" r="3" fill="#a34981" className="animate-pulse">
          <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite" />
        </circle>
      </svg>
    </div>
  );
};

export default IWCLogo;