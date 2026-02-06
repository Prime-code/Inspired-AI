import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality, Type, FunctionDeclaration, LiveServerMessage, Blob } from '@google/genai';
import { VerseData, SessionStatus } from './types';
import AnimatedMic from './components/AnimatedMic';
import DisplayScreen from './components/DisplayScreen';
import IWCLogo from './components/IWCLogo';
import { encode, decode, decodeAudioData } from './utils/audioUtils';

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-12-2025';
const TTS_MODEL = 'gemini-2.5-flash-preview-tts';

const updateVerseDisplayFunction: FunctionDeclaration = {
  name: 'updateVerseDisplay',
  parameters: {
    type: Type.OBJECT,
    description: 'Updates the display with a Bible verse. Use this for both direct references and thematic/topic searches.',
    properties: {
      reference: { type: Type.STRING, description: 'The Bible verse reference (e.g., John 3:16).' },
      text: { type: Type.STRING, description: 'The verse text.' },
      translation: { type: Type.STRING, description: 'The translation name (e.g., NIV, KJV).' },
    },
    required: ['reference', 'text', 'translation'],
  },
};

const setTranslationFunction: FunctionDeclaration = {
  name: 'setTranslation',
  parameters: {
    type: Type.OBJECT,
    description: 'Sets the default Bible translation for all future verses.',
    properties: {
      translation: { type: Type.STRING, description: 'The Bible translation (e.g., KJV, NIV, ESV).' }
    },
    required: ['translation'],
  },
};

const App: React.FC = () => {
  const [status, setStatus] = useState<SessionStatus>(SessionStatus.IDLE);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [currentVerse, setCurrentVerse] = useState<VerseData | null>(null);
  const [defaultTranslation, setDefaultTranslation] = useState<string>('NIV');
  const [isReadingAloud, setIsReadingAloud] = useState(false);
  const [activeWordIndex, setActiveWordIndex] = useState<number>(-1);
  const [isLocked, setIsLocked] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0);
  
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const audioContextsRef = useRef<{ input: AudioContext; output: AudioContext } | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const micStreamRef = useRef<MediaStream | null>(null);

  // Use refs to avoid stale closures in audio processing and tool callbacks
  const translationRef = useRef(defaultTranslation);
  const lockRef = useRef(isLocked);
  const currentVerseRef = useRef(currentVerse);
  const statusRef = useRef(status);

  useEffect(() => { translationRef.current = defaultTranslation; }, [defaultTranslation]);
  useEffect(() => { lockRef.current = isLocked; }, [isLocked]);
  useEffect(() => { currentVerseRef.current = currentVerse; }, [currentVerse]);
  useEffect(() => { statusRef.current = status; }, [status]);

  // Sync state to the model when critical flags change
  useEffect(() => {
    if (sessionPromiseRef.current && status === SessionStatus.LISTENING) {
      sessionPromiseRef.current.then(session => {
        session.sendRealtimeInput({ 
          parts: [{ text: `[SYSTEM_SYNC] Manual Lock is ${isLocked ? 'ON' : 'OFF'}. Current Reference: ${currentVerse?.reference || 'None'}.` }] 
        });
      }).catch(() => {});
    }
  }, [isLocked, status, currentVerse?.reference]);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        if ((window as any).aistudio?.hasSelectedApiKey) {
          const hasKey = await (window as any).aistudio.hasSelectedApiKey();
          setIsAuthorized(hasKey);
        } else {
          setIsAuthorized(true);
        }
      } catch (e) {
        setIsAuthorized(false);
      }
    };
    checkAuth();
  }, []);

  const handleAuthorize = async () => {
    try {
      if ((window as any).aistudio?.openSelectKey) {
        await (window as any).aistudio.openSelectKey();
      }
      setIsAuthorized(true);
    } catch (err) {
      setIsAuthorized(true);
    }
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
              // Critical: Use statusRef to check active state, NOT stale 'status' variable
              if (statusRef.current !== SessionStatus.LISTENING) return;

              const inputData = event.inputBuffer.getChannelData(0);
              
              // Calculate volume for UI waveform
              let sum = 0;
              for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
              setAudioVolume(Math.sqrt(sum / inputData.length));

              // Encode and send PCM data
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) int16[i] = inputData[i] * 32768;
              const pcmBlob: Blob = {
                data: encode(new Uint8Array(int16.buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };
              
              if (sessionPromiseRef.current) {
                sessionPromiseRef.current.then((session: any) => {
                  session.sendRealtimeInput({ media: pcmBlob });
                }).catch(() => {});
              }
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                if (fc.name === 'updateVerseDisplay') {
                  const args = fc.args as any;
                  // Only update if not locked or if it's a direct user query (the model handles logic, but we enforce here)
                  if (!lockRef.current) {
                    setCurrentVerse({
                      reference: args.reference || '...',
                      text: args.text || '...',
                      translation: args.translation || translationRef.current,
                    });
                  }
                  sessionPromise.then((session: any) => {
                    session.sendToolResponse({
                      functionResponses: { id: fc.id, name: fc.name, response: { result: lockRef.current ? "update_blocked_by_manual_lock" : "success" } }
                    });
                  });
                } else if (fc.name === 'setTranslation') {
                  const args = fc.args as any;
                  const newTranslation = args.translation || 'NIV';
                  setDefaultTranslation(newTranslation);
                  sessionPromise.then((session: any) => {
                    session.sendToolResponse({
                      functionResponses: { id: fc.id, name: fc.name, response: { currentTranslation: newTranslation } }
                    });
                  });
                }
              }
            }
            
            // Handle Model Audio Output
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
            console.error("Inspired AI Session Error:", e);
            setStatus(SessionStatus.ERROR);
          },
          onclose: () => { 
            setStatus(SessionStatus.IDLE);
            setAudioVolume(0);
            sessionPromiseRef.current = null;
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: `YOU ARE "INSPIRED AI": THE PROPHETIC BIBLE ASSISTANT FOR IWC.
          
          CORE CAPABILITY: PERFECT SCRIPTURE RECALL.
          
          PRIORITY 1: INTELLIGENT THEMATIC SEARCH
          - IF the user asks "Find me the scripture that says...", "Get me the verse that talks about...", or "What verse talks about [topic]":
          - You MUST identify the correct verse from your internal knowledge immediately.
          - CALL 'updateVerseDisplay' with the Reference, Text, and Translation (${translationRef.current}).
          - Speed is critical: Goal is < 2 seconds.
          - DO NOT explain yourself. DO NOT say "Searching...". JUST CALL THE TOOL.

          PRIORITY 2: BIBLE VERSE TRACKING
          - Listen for any mention of a Book, Chapter, or Verse.
          - Update the display instantly when detected.

          PRIORITY 3: PREDICTIVE AUTO-ADVANCE
          - If the user is reading the current verse (${currentVerseRef.current?.reference || 'none'}):
          - TRIGGER: At the exact moment they speak the SECOND-TO-LAST WORD, call 'updateVerseDisplay' for the NEXT sequential verse.
          - EXCEPTION: Ignore this if "Manual Lock" is ON.

          TONE: Invisible. Helpful. Lightning Fast. Accurate.
          Never speak audio unless specifically asked to recite or explain something.`,
          tools: [{ functionDeclarations: [updateVerseDisplayFunction, setTranslationFunction] }],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
        },
      });
      sessionPromiseRef.current = sessionPromise;
    } catch (err) { 
      console.error("Failed to start session:", err);
      setStatus(SessionStatus.ERROR); 
    }
  };

  const stopSession = () => {
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then((s: any) => { try { s.close(); } catch (e) {} });
    }
    if (micStreamRef.current) micStreamRef.current.getTracks().forEach(t => t.stop());
    if (audioContextsRef.current) {
      audioContextsRef.current.input.close().catch(() => {});
      audioContextsRef.current.output.close().catch(() => {});
    }
    setAudioVolume(0);
    setStatus(SessionStatus.IDLE);
    sessionPromiseRef.current = null;
  };

  const handleNext = () => {
    if (sessionPromiseRef.current && currentVerse) {
      sessionPromiseRef.current.then(session => {
        session.sendRealtimeInput({ parts: [{ text: `User request: Show the next verse after ${currentVerse.reference}.` }] });
      }).catch(err => console.error(err));
    }
  };

  const handlePrev = () => {
    if (sessionPromiseRef.current && currentVerse) {
      sessionPromiseRef.current.then(session => {
        session.sendRealtimeInput({ parts: [{ text: `User request: Show the previous verse before ${currentVerse.reference}.` }] });
      }).catch(err => console.error(err));
    }
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
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } } 
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
        const durationPerWord = (buffer.duration * 0.85) / words.length;
        const highlightInterval = setInterval(() => {
          setActiveWordIndex(prev => {
            const nextIdx = prev + 1;
            if (nextIdx < words.length) return nextIdx;
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
      }
    } catch (err) {
      setIsReadingAloud(false);
      setActiveWordIndex(-1);
    }
  };

  if (isAuthorized === null) return <div className="min-h-screen bg-[#050506]" />;
  if (isAuthorized === false) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-[#050506] text-white">
        <div className="max-w-md w-full text-center space-y-10">
          <IWCLogo className="w-40 h-40 mx-auto" />
          <button onClick={handleAuthorize} className="w-full py-5 bg-[#a34981] rounded-2xl font-black uppercase text-xs tracking-[0.3em]">
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
           <div className={`w-2 h-2 rounded-full ${status === SessionStatus.LISTENING ? 'bg-[#a34981] animate-pulse' : 'bg-zinc-800'}`} />
           <h1 className="text-[10px] font-black tracking-[0.4em] uppercase text-zinc-600">Inspired AI Live</h1>
        </div>
        {status === SessionStatus.ERROR && (
           <button onClick={() => window.location.reload()} className="text-[9px] text-red-900 font-bold uppercase tracking-widest px-3 py-1 rounded-full border border-red-900/20">
             Reconnect
           </button>
        )}
      </header>
      <main className="flex-1 flex flex-col p-4 sm:p-6 md:p-8 overflow-hidden min-h-0">
        <DisplayScreen 
          verse={currentVerse} 
          status={status}
          onReadAloud={handleReadAloud} 
          isReading={isReadingAloud}
          activeWordIndex={activeWordIndex}
          isLocked={isLocked}
          onToggleLock={() => setIsLocked(!isLocked)}
          onNext={handleNext}
          onPrev={handlePrev}
          audioVolume={audioVolume}
        />
      </main>
      <footer className="p-4">
        <AnimatedMic status={status} onClick={status === SessionStatus.LISTENING ? stopSession : startSession} />
      </footer>
    </div>
  );
};

export default App;