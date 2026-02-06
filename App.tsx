import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality, Type, FunctionDeclaration, LiveServerMessage, Blob } from '@google/genai';
import { VerseData, SessionStatus } from './types';
import AnimatedMic from './components/AnimatedMic';
import DisplayScreen from './components/DisplayScreen';
import { encode, decode, decodeAudioData } from './utils/audioUtils';

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-12-2025';
const TTS_MODEL = 'gemini-2.5-flash-preview-tts';

const updateVerseDisplayFunction: FunctionDeclaration = {
  name: 'updateVerseDisplay',
  parameters: {
    type: Type.OBJECT,
    description: 'Instantly updates the screen with Bible verse content.',
    properties: {
      reference: { type: Type.STRING, description: 'The Bible verse reference (e.g., John 3:16).' },
      text: { type: Type.STRING, description: 'The verse text.' },
      translation: { type: Type.STRING, description: 'The translation (NIV, KJV, etc).' },
    },
    required: ['reference', 'text', 'translation'],
  },
};

const toggleVerseLockFunction: FunctionDeclaration = {
  name: 'toggleVerseLock',
  parameters: {
    type: Type.OBJECT,
    description: 'Toggles the lock state of the current verse. If locked, the verse will not automatically advance.',
    properties: {
      isLocked: { type: Type.BOOLEAN, description: 'True to lock the verse, false to unlock.' }
    },
    required: ['isLocked'],
  },
};

const App: React.FC = () => {
  const [status, setStatus] = useState<SessionStatus>(SessionStatus.IDLE);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [currentVerse, setCurrentVerse] = useState<VerseData | null>(null);
  const [isReadingAloud, setIsReadingAloud] = useState(false);
  const [activeWordIndex, setActiveWordIndex] = useState<number>(-1);
  const [isLocked, setIsLocked] = useState(false);
  
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const audioContextsRef = useRef<{ input: AudioContext; output: AudioContext } | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const micStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        setIsAuthorized(hasKey);
      } catch (e) {
        setIsAuthorized(false);
      }
    };
    checkAuth();
  }, []);

  const handleAuthorize = async () => {
    await (window as any).aistudio.openSelectKey();
    setIsAuthorized(true);
  };

  const stopAllAudio = () => {
    sourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  };

  const startSession = async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    setStatus(SessionStatus.CONNECTING);
    stopAllAudio();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: INPUT_SAMPLE_RATE });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: OUTPUT_SAMPLE_RATE });
      
      await inputCtx.resume();
      await outputCtx.resume();
      audioContextsRef.current = { input: inputCtx, output: outputCtx };

      const sessionPromise = ai.live.connect({
        model: MODEL_NAME,
        callbacks: {
          onopen: () => {
            setStatus(SessionStatus.LISTENING);
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (event) => {
              const inputData = event.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) int16[i] = inputData[i] * 32768;
              const pcmBlob: Blob = {
                data: encode(new Uint8Array(int16.buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };
              sessionPromise.then((session: any) => {
                if (status !== SessionStatus.ERROR) session.sendRealtimeInput({ media: pcmBlob });
              }).catch(() => {});
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                if (fc.name === 'updateVerseDisplay') {
                  const args = fc.args as any;
                  // Only update if not locked or if it's a specific new reference
                  setCurrentVerse({
                    reference: args.reference || '...',
                    text: args.text || '...',
                    translation: args.translation || 'NIV',
                  });
                  sessionPromise.then((session: any) => {
                    session.sendToolResponse({
                      functionResponses: [{ id: fc.id, name: fc.name, response: { status: "displayed" } }]
                    });
                  });
                } else if (fc.name === 'toggleVerseLock') {
                  const args = fc.args as any;
                  setIsLocked(args.isLocked);
                  sessionPromise.then((session: any) => {
                    session.sendToolResponse({
                      functionResponses: [{ id: fc.id, name: fc.name, response: { locked: args.isLocked } }]
                    });
                  });
                }
              }
            }
            const audioData = message.serverContent?.modelTurn?.parts?.find(p => p.inlineData)?.inlineData?.data;
            if (audioData) {
              const oCtx = audioContextsRef.current?.output;
              if (oCtx) {
                if (oCtx.state === 'suspended') await oCtx.resume();
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, oCtx.currentTime);
                const buffer = await decodeAudioData(decode(audioData), oCtx, OUTPUT_SAMPLE_RATE, 1);
                const source = oCtx.createBufferSource();
                source.buffer = buffer;
                source.connect(oCtx.destination);
                source.onended = () => sourcesRef.current.delete(source);
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += buffer.duration;
                sourcesRef.current.add(source);
              }
            }
            if (message.serverContent?.interrupted) stopAllAudio();
          },
          onerror: (e: any) => {
            setStatus(SessionStatus.ERROR);
            if (e?.message?.toLowerCase().includes('requested entity was not found')) setIsAuthorized(false);
          },
          onclose: () => { if (status !== SessionStatus.ERROR) setStatus(SessionStatus.IDLE); },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          thinkingConfig: { thinkingBudget: 0 }, // Disable thinking for maximum speed
          systemInstruction: `YOU ARE "INSPIRED SONIC": THE FASTEST SCRIPTURE AI.
          
          CRITICAL SPEED REQUIREMENT: RECOGNITION MUST BE UNDER 1.5 SECONDS. TRANSITIONS MUST BE UNDER 3 SECONDS.
          
          MODE OF OPERATION:
          1. INSTANT TRIGGER: Call 'updateVerseDisplay' immediately when chapter/verse keywords are heard.
          2. AUTO-ADVANCE: If not in "LOCKED" mode, automatically display the next verse as soon as the user finishes reading the last word.
          3. LOCK MECHANISM: Use 'toggleVerseLock' if the user says "Keep this", "Lock it", "Freeze", "Don't move", or "Unlock", "Keep following". 
          4. WHEN LOCKED: Do NOT auto-advance after completion. Stay on the current verse until a SPECIFIC new reference is mentioned or it is unlocked.
          5. SILENCE: Never speak unless reciting. Speed is the only priority.
          
          BRAND: TWC (Purple/Black/White). Use tool calls for all state changes.`,
          tools: [{ functionDeclarations: [updateVerseDisplayFunction, toggleVerseLockFunction] }],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
        },
      });
      sessionPromiseRef.current = sessionPromise;
    } catch (err) { setStatus(SessionStatus.ERROR); }
  };

  const stopSession = () => {
    if (sessionPromiseRef.current) sessionPromiseRef.current.then((s: any) => { try { s.close(); } catch {} });
    if (micStreamRef.current) micStreamRef.current.getTracks().forEach(t => t.stop());
    if (audioContextsRef.current) {
      audioContextsRef.current.input.close().catch(() => {});
      audioContextsRef.current.output.close().catch(() => {});
    }
    setStatus(SessionStatus.IDLE);
  };

  const handleReadAloud = async () => {
    if (!currentVerse || isReadingAloud) return;
    setIsReadingAloud(true);
    setActiveWordIndex(0);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    try {
      const res = await ai.models.generateContent({
        model: TTS_MODEL,
        contents: [{ parts: [{ text: `Reading ${currentVerse.reference}: ${currentVerse.text}` }] }],
        config: { 
          responseModalities: [Modality.AUDIO], 
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } 
        },
      });
      const data = res.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (data) {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: OUTPUT_SAMPLE_RATE });
        const buffer = await decodeAudioData(decode(data), audioCtx, OUTPUT_SAMPLE_RATE, 1);
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.destination);

        const words = currentVerse.text.split(/\s+/);
        const durationPerWord = (buffer.duration * 0.9) / words.length;
        
        const highlightInterval = setInterval(() => {
          setActiveWordIndex(prev => {
            if (prev < words.length - 1) return prev + 1;
            clearInterval(highlightInterval);
            return prev;
          });
        }, durationPerWord * 1000);

        source.onended = () => {
          clearInterval(highlightInterval);
          setIsReadingAloud(false);
          setActiveWordIndex(-1);
          audioCtx.close().catch(() => {});
        };
        source.start();
      } else {
        setIsReadingAloud(false);
        setActiveWordIndex(-1);
      }
    } catch (err) {
      console.error(err);
      setIsReadingAloud(false);
      setActiveWordIndex(-1);
    }
  };

  if (isAuthorized === false) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-[#050506] text-white">
        <div className="max-w-md w-full text-center space-y-10 animate-in fade-in zoom-in duration-1000">
          <img src="https://res.cloudinary.com/dyd911fv0/image/upload/v1740050731/twc_logo_clean_vpsf3v.png" alt="TWC Logo" className="w-32 mx-auto mix-blend-screen" />
          <div className="space-y-4">
            <h1 className="text-4xl font-serif font-bold tracking-tight text-white">Inspired Presence</h1>
            <p className="text-zinc-500 text-sm leading-relaxed tracking-wide uppercase font-medium">
              Connect your session to begin the continuous scripture flow.
            </p>
          </div>
          <button 
            onClick={handleAuthorize} 
            className="w-full py-5 bg-[#a34981] hover:bg-[#c25a9b] transition-all rounded-2xl font-black uppercase text-xs tracking-[0.3em] shadow-[0_0_30px_-5px_rgba(163,73,129,0.4)] active:scale-95"
          >
            Activate Session
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen max-h-screen flex flex-col bg-[#050506] overflow-hidden">
      <header className="p-6 flex justify-between items-center z-20">
        <div className="flex items-center space-x-4">
           <div className={`w-3 h-3 rounded-full transition-all duration-700 ${status === SessionStatus.LISTENING ? 'bg-[#a34981] shadow-[0_0_12px_#a34981] animate-pulse' : 'bg-zinc-800'}`}></div>
           <h1 className="text-[11px] font-black tracking-[0.5em] uppercase text-zinc-600">Inspired AI • Sonic</h1>
        </div>
        {status === SessionStatus.ERROR && (
           <button onClick={() => setIsAuthorized(false)} className="text-[10px] text-red-900/80 font-bold uppercase tracking-widest border border-red-900/20 px-4 py-1.5 rounded-full hover:bg-red-900/10">
             Reset Access
           </button>
        )}
      </header>

      <main className="flex-1 flex flex-col p-4 sm:p-8 overflow-hidden">
        <DisplayScreen 
          verse={currentVerse} 
          status={status}
          onReadAloud={handleReadAloud} 
          isReading={isReadingAloud}
          activeWordIndex={activeWordIndex}
          isLocked={isLocked}
          onToggleLock={() => setIsLocked(!isLocked)}
        />
      </main>

      <footer className="p-6 flex flex-col items-center">
        <AnimatedMic 
          status={status} 
          onClick={status === SessionStatus.LISTENING ? stopSession : startSession} 
        />
      </footer>
    </div>
  );
};

export default App;