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
    description: 'Updates the display with a Bible verse.',
    properties: {
      reference: { type: Type.STRING, description: 'The Bible verse reference (e.g., John 3:16).' },
      text: { type: Type.STRING, description: 'The verse text.' },
      translation: { type: Type.STRING, description: 'The translation name.' },
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

  const translationRef = useRef(defaultTranslation);
  const lockRef = useRef(isLocked);
  const currentVerseRef = useRef(currentVerse);

  useEffect(() => {
    translationRef.current = defaultTranslation;
  }, [defaultTranslation]);

  useEffect(() => {
    lockRef.current = isLocked;
  }, [isLocked]);

  useEffect(() => {
    currentVerseRef.current = currentVerse;
  }, [currentVerse]);

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
              const inputData = event.inputBuffer.getChannelData(0);
              let sum = 0;
              for (let i = 0; i < inputData.length; i++) {
                sum += inputData[i] * inputData[i];
              }
              const rms = Math.sqrt(sum / inputData.length);
              setAudioVolume(rms);

              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) int16[i] = inputData[i] * 32768;
              const pcmBlob: Blob = {
                data: encode(new Uint8Array(int16.buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };
              sessionPromise.then((session: any) => {
                session.sendRealtimeInput({ media: pcmBlob });
              }).catch(() => {});
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                if (fc.name === 'updateVerseDisplay') {
                  // ONLY update if NOT manually locked
                  if (!lockRef.current) {
                    const args = fc.args as any;
                    setCurrentVerse({
                      reference: args.reference || '...',
                      text: args.text || '...',
                      translation: args.translation || translationRef.current,
                    });
                  }
                  sessionPromise.then((session: any) => {
                    session.sendToolResponse({
                      functionResponses: [{ id: fc.id, name: fc.name, response: { status: lockRef.current ? "ignored_locked" : "displayed" } }]
                    });
                  });
                } else if (fc.name === 'setTranslation') {
                  const args = fc.args as any;
                  const newTranslation = args.translation || 'NIV';
                  setDefaultTranslation(newTranslation);
                  sessionPromise.then((session: any) => {
                    session.sendToolResponse({
                      functionResponses: [{ id: fc.id, name: fc.name, response: { currentTranslation: newTranslation } }]
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
            console.error("Live Session Error:", e);
            if (e?.message?.toLowerCase().includes('requested entity was not found')) {
              setIsAuthorized(false);
              setStatus(SessionStatus.ERROR);
            }
          },
          onclose: () => { 
            if (status !== SessionStatus.ERROR) {
               setStatus(SessionStatus.IDLE);
            }
            setAudioVolume(0);
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          thinkingConfig: { thinkingBudget: 0 },
          systemInstruction: `YOU ARE "INSPIRED AI": THE SCRIPTURE ASSISTANT FOR INSPIRED WORD CHURCH (IWC).
          
          LATENCY IS KEY: RECOGNIZE REFERENCES UNDER 1.5 SECONDS.
          
          STRICT PROTOCOL:
          1. DISPLAY VERSE: CALL 'updateVerseDisplay' immediately when a chapter/verse is mentioned. Use ${translationRef.current} unless specified.
          
          2. AUTO-FLOW LOGIC (SEQUENTIAL): Monitor the user's speech carefully. If they are reading the verse currently displayed (Current Verse: ${currentVerseRef.current?.reference}) and you hear them reach the SECOND-TO-LAST WORD of that verse, you MUST automatically call 'updateVerseDisplay' for the NEXT sequential verse (e.g., if John 3:16 is displayed, open John 3:17) WITHOUT being asked.
             - This sequential flow ONLY happens if the MANUAL LOCK is OFF. 
          
          3. TRANSLATION: If the user says "Switch to KJV", "Show me NIV", call 'setTranslation'. This persists until changed again.
          
          4. MANUAL LOCK: The user manually toggles the "Lock" button in the UI. 
             IMPORTANT: If the display is LOCKED (manual UI action), DO NOT attempt to call 'updateVerseDisplay' for ANY reason, including the auto-flow logic.
             
          5. PERPETUAL LISTENING: You stay active until the user clicks to stop the session.
          
          6. SILENCE: Never speak audio unless explicitly asked to "recite".
          
          CURRENT PREFERRED TRANSLATION: ${translationRef.current}.
          
          BRAND: IWC. Stay ahead of the preacher. Be intelligent and predictive.`,
          tools: [{ functionDeclarations: [updateVerseDisplayFunction, setTranslationFunction] }],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
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
      sessionPromiseRef.current.then((s: any) => { 
        try { s.close(); } catch (e) {} 
      });
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
    }
    if (audioContextsRef.current) {
      audioContextsRef.current.input.close().catch(() => {});
      audioContextsRef.current.output.close().catch(() => {});
    }
    setAudioVolume(0);
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
        contents: [{ parts: [{ text: `Reading ${currentVerse.reference} in the ${currentVerse.translation} translation: ${currentVerse.text}` }] }],
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
        const durationPerWord = (buffer.duration * 0.85) / words.length;
        
        const highlightInterval = setInterval(() => {
          setActiveWordIndex(prev => {
            const nextIdx = prev + 1;
            
            // PROGRAMMATIC AUTO-FLOW during Recite
            if (nextIdx === words.length - 1 && !lockRef.current) {
               // When we reach the second to last word during recite, 
               // the Live session instruction should ideally pick this up from the audio.
               // We don't force a tool call here to avoid conflicts, but the model instructions 
               // now explicitly cover "finishing reading".
            }

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
        setActiveWordIndex(-1);
      }
    } catch (err) {
      setIsReadingAloud(false);
      setActiveWordIndex(-1);
    }
  };

  if (isAuthorized === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050506]">
        <div className="w-10 h-10 border-4 border-[#a34981]/20 border-t-[#a34981] rounded-full animate-spin"></div>
      </div>
    );
  }

  if (isAuthorized === false) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-[#050506] text-white">
        <div className="max-w-md w-full text-center space-y-10 animate-in fade-in zoom-in duration-1000">
          <IWCLogo className="w-40 h-40 mx-auto" />
          <div className="space-y-4">
            <h1 className="text-4xl font-serif font-bold tracking-tight text-white">Inspired Presence</h1>
            <p className="text-zinc-500 text-sm leading-relaxed tracking-wide uppercase font-medium">
              Activate your IWC session to begin.
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
           <div className={`w-2 h-2 rounded-full transition-all duration-700 ${status === SessionStatus.LISTENING ? 'bg-[#a34981] shadow-[0_0_12px_#a34981] animate-pulse' : 'bg-zinc-800'}`}></div>
           <h1 className="text-[10px] font-black tracking-[0.4em] uppercase text-zinc-600">IWC Live AI</h1>
        </div>
        {status === SessionStatus.ERROR && (
           <button onClick={() => setIsAuthorized(false)} className="text-[9px] text-red-900/80 font-bold uppercase tracking-widest border border-red-900/20 px-3 py-1 rounded-full hover:bg-red-900/10">
             Reset
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
          audioVolume={audioVolume}
        />
      </main>

      <footer className="p-4 flex flex-col items-center">
        <AnimatedMic 
          status={status} 
          onClick={status === SessionStatus.LISTENING ? stopSession : startSession} 
        />
      </footer>
    </div>
  );
};

export default App;