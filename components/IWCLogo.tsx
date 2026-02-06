import React from 'react';

interface IWCLogoProps {
  className?: string;
}

const IWCLogo: React.FC<IWCLogoProps> = ({ className = "w-12 h-12" }) => {
  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_0_15px_rgba(163,73,129,0.3)]">
        {/* Abstract "Inspired" Halo */}
        <path 
          d="M 20 50 A 30 30 0 0 1 80 50" 
          fill="none" 
          stroke="#a34981" 
          strokeWidth="4" 
          strokeLinecap="round" 
          className="opacity-40"
        />
        
        {/* Stylized Typography */}
        <text 
          x="50%" 
          y="65%" 
          textAnchor="middle" 
          fill="white" 
          style={{ 
            fontFamily: "'Playfair Display', serif", 
            fontWeight: 700, 
            fontSize: '32px',
            letterSpacing: '-1px'
          }}
        >
          IWC
        </text>
        
        {/* Dot of Inspiration */}
        <circle cx="50" cy="30" r="3" fill="#a34981" className="animate-pulse" />
        
        {/* Accent Swoosh */}
        <path 
          d="M 35 75 Q 50 85 65 75" 
          fill="none" 
          stroke="#a34981" 
          strokeWidth="2" 
          strokeLinecap="round" 
          className="opacity-60"
        />
      </svg>
    </div>
  );
};

export default IWCLogo;