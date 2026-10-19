import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Loader2, Volume2, VolumeX, Keyboard, Send, Trash2, Zap, Image as ImageIcon } from "lucide-react";
import { getPOWERResponse, getPOWERAudio, resetPOWERSession } from "./services/geminiService";
import { processCommand } from "./services/commandService";
import { LiveSessionManager } from "./services/liveService";
import Visualizer from "./components/Visualizer";
import PermissionModal from "./components/PermissionModal";
import { playPCM } from "./utils/audioUtils";
import { motion, AnimatePresence } from "motion/react";

type AppState = "idle" | "listening" | "processing" | "speaking";

interface ChatMessage {
  id: string;
  sender: "user" | "power";
  text: string;
  image?: string;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function App() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem("power_chat_history");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.length === 0) return [{ 
          id: "welcome", 
          sender: "power", 
          text: "Uff, finally you're here! I was getting bored staring at this screen. Tumhe meri zaroorat hai ya bas time pass karne aaye ho? Anyway, POWER is here. What do you want?" 
        }];
        return parsed;
      } catch (e) {
        console.error("Failed to parse chat history", e);
      }
    }
    return [{ 
      id: "welcome", 
      sender: "power", 
      text: "Uff, finally! Main kabse wait kar rahi thi. Send me a photo or tell me something smart—bore mat karna bas. I'm ready to judge your vibe today!" 
    }];
  });

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
    localStorage.setItem("power_chat_history", JSON.stringify(messages));
  }, [messages]);

  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (liveSessionRef.current) {
      liveSessionRef.current.isMuted = isMuted;
    }
  }, [isMuted]);

  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);

  const liveSessionRef = useRef<LiveSessionManager | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, appState]);

  const handleTextCommand = useCallback(async (finalTranscript: string, image?: string) => {
    if (!finalTranscript.trim() && !image) {
      setAppState("idle");
      return;
    }

    const userMsg: ChatMessage = { 
      id: Date.now().toString(), 
      sender: "user", 
      text: finalTranscript,
      image: image 
    };
    
    setMessages((prev) => [...prev, userMsg]);
    
    // If live session is active and no image, keep using live session
    if (isSessionActive && liveSessionRef.current && !image) {
      liveSessionRef.current.sendText(finalTranscript);
      return;
    }

    setAppState("processing");

    // 1. Check for browser commands (only if no image)
    const commandResult = !image ? processCommand(finalTranscript) : { isBrowserAction: false, action: "", url: "" };

    let responseText = "";

    if (commandResult.isBrowserAction) {
      responseText = commandResult.action;
      setMessages((prev) => [...prev, { id: Date.now().toString() + "-p", sender: "power", text: responseText }]);
      
      if (!isMuted) {
        setAppState("speaking");
        const audioBase64 = await getPOWERAudio(responseText);
        if (audioBase64) {
          await playPCM(audioBase64);
        }
      }

      setAppState("idle");

      setTimeout(() => {
        if (commandResult.url) {
          window.open(commandResult.url, "_blank");
        }
      }, 1500);
    } else {
      // 2. General Chit-Chat via Gemini (supports image)
      responseText = await getPOWERResponse(finalTranscript, messagesRef.current, image);
      setMessages((prev) => [...prev, { id: Date.now().toString() + "-p", sender: "power", text: responseText }]);
      
      if (!isMuted) {
        setAppState("speaking");
        const audioBase64 = await getPOWERAudio(responseText);
        if (audioBase64) {
          await playPCM(audioBase64);
        }
      }
      setAppState("idle");
    }
  }, [isMuted, isSessionActive]);

  useEffect(() => {
    return () => {
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
      }
    };
  }, []);

  const toggleListening = async () => {
    if (isSessionActive) {
      setIsSessionActive(false);
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
        liveSessionRef.current = null;
      }
      setAppState("idle");
      resetPOWERSession();
    } else {
      try {
        setIsSessionActive(true);
        resetPOWERSession();
        
        const session = new LiveSessionManager();
        session.isMuted = isMuted;
        liveSessionRef.current = session;
        
        session.onStateChange = (state) => {
          setAppState(state);
        };
        
        session.onMessage = (sender, text) => {
          setMessages((prev) => [...prev, { id: Date.now().toString() + "-" + sender, sender, text }]);
        };
        
        session.onCommand = (url) => {
          setTimeout(() => {
            window.open(url, "_blank");
          }, 1000);
        };

        await session.start();
      } catch (e) {
        console.error("Failed to start session", e);
        setShowPermissionModal(true);
        setIsSessionActive(false);
        setAppState("idle");
      }
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim() && !selectedImage) return;
    
    handleTextCommand(textInput, selectedImage || undefined);
    setTextInput("");
    setSelectedImage(null);
  };

  return (
    <div className="h-[100dvh] w-screen bg-[#020617] text-white flex flex-col items-center justify-between font-sans relative overflow-hidden m-0 p-0">
      {showPermissionModal && (
        <PermissionModal 
          onClose={() => setShowPermissionModal(false)} 
        />
      )}

      {/* Cinematic Lighting/Electric Background */}
      <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none bg-[radial-gradient(circle_at_center,_#0f172a_0%,_#020617_100%)]">
        {/* Animated Lightning Grid */}
        <div className="absolute inset-0 opacity-20 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4.5rem_4.5rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />
        
        {/* Electric Bolts */}
        <AnimatePresence>
           {[...Array(6)].map((_, i) => (
             <motion.div
               key={i}
               initial={{ opacity: 0 }}
               animate={{ 
                 opacity: [0, 0.4, 0],
                 scale: [0.8, 1.2, 0.8],
                 x: [Math.random() * 50 - 25 + "%", Math.random() * 50 - 25 + "%"],
                 y: [Math.random() * 50 - 25 + "%", Math.random() * 50 - 25 + "%"],
                 rotate: Math.random() * 360
               }}
               transition={{ 
                 duration: 0.1 + Math.random() * 0.4, 
                 repeat: Infinity, 
                 repeatDelay: Math.random() * 2,
                 ease: "linear"
               }}
               className="absolute w-0.5 h-48 bg-cyan-400 blur-[1.5px] shadow-[0_0_10px_#22d3ee]"
               style={{ left: Math.random() * 100 + "%", top: Math.random() * 100 + "%" }}
             />
           ))}
        </AnimatePresence>

        {/* Pulsing Energy Cores */}
        <motion.div 
          animate={{ scale: [1, 1.1, 1], opacity: [0.1, 0.15, 0.1] }}
          transition={{ duration: 4, repeat: Infinity }}
          className="absolute top-1/4 left-1/4 w-[50%] h-[50%] bg-blue-600/10 blur-[120px] rounded-full" 
        />
        <motion.div 
          animate={{ scale: [1.1, 1, 1.1], opacity: [0.1, 0.15, 0.1] }}
          transition={{ duration: 5, repeat: Infinity }}
          className="absolute bottom-1/4 right-1/4 w-[50%] h-[50%] bg-cyan-600/10 blur-[120px] rounded-full" 
        />
      </div>

      {/* Header */}
      <header className="absolute top-0 left-0 w-full flex justify-between items-center z-20 shrink-0 px-6 py-4 md:px-12 md:py-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-500 flex items-center justify-center font-bold text-lg shadow-[0_0_20px_rgba(6,182,212,0.5)]">
            <Zap size={20} className="text-white fill-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400 uppercase">POWER</h1>
            <div className="text-[10px] uppercase tracking-tighter opacity-50 font-mono">Electric Intelligence</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={() => {
                if (confirm("Are you sure you want to clear the chat history?")) {
                  setMessages([]);
                  resetPOWERSession();
                }
              }}
              className="p-2 rounded-full bg-white/5 hover:bg-red-500/20 hover:text-red-400 transition-colors border border-white/10"
              title="Clear Chat History"
            >
              <Trash2 size={18} className="opacity-70" />
            </button>
          )}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <VolumeX size={18} className="opacity-70" />
            ) : (
              <Volume2 size={18} className="opacity-70" />
            )}
          </button>
        </div>
      </header>

      {/* Main Content - Visualizer & Chat */}
      <main className="absolute inset-0 flex flex-col items-center justify-start w-full h-full z-10 overflow-hidden pt-24 pb-32 px-4 md:px-12 pointer-events-none">
        
        {/* Chat History Overlay */}
        <div className="w-full max-w-2xl flex-1 overflow-y-auto scrollbar-hide py-4 flex flex-col gap-6 pointer-events-auto">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={`flex w-full ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
              >
                <div 
                  className={`
                    max-w-[85%] md:max-w-[70%] px-4 py-3 shadow-xl relative
                    ${msg.sender === "user" 
                      ? "bg-slate-800/80 text-white rounded-2xl rounded-tr-none border border-white/10" 
                      : "bg-gradient-to-br from-cyan-500/90 to-blue-600/90 text-white rounded-2xl rounded-tl-none border border-cyan-400/30 shadow-[0_0_15px_rgba(6,182,212,0.3)] font-medium"
                    }
                  `}
                >
                  {msg.sender === "power" && (
                    <div className="absolute -top-3 -left-2 bg-cyan-400 text-slate-900 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter shadow-sm">
                      POWER
                    </div>
                  )}
                  <p className="text-sm md:text-base leading-relaxed tracking-wide">
                    {msg.text}
                  </p>
                  {msg.image && (
                    <div className="mt-2 rounded-lg overflow-hidden border border-white/10">
                      <img src={msg.image} alt="Sent" className="max-w-full h-auto object-cover" referrerPolicy="no-referrer" />
                    </div>
                  )}
                  <div className={`absolute bottom-[-10px] w-4 h-4 transform rotate-45 ${msg.sender === "user" ? "right-2 bg-slate-800/80" : "left-2 bg-cyan-500/90"}`} />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        {/* Status Indicators Layer */}
        <div className="fixed top-1/2 left-0 right-0 -translate-y-1/2 flex justify-between w-full px-6 md:px-12 pointer-events-none pointer-events-none">
          {/* Left Column: Status */}
          <div className="flex flex-col justify-center gap-4">
            <div className="h-6">
              <AnimatePresence>
                {appState === "processing" && (
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="flex items-center gap-2 text-cyan-400 font-mono text-sm uppercase tracking-widest bg-cyan-900/30 px-3 py-1 rounded-full backdrop-blur-sm border border-cyan-500/20"
                  >
                    <Loader2 size={14} className="animate-spin" />
                    Analyzing
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Right Column: User Status */}
          <div className="flex flex-col justify-center gap-4">
            <div className="h-6 flex justify-end">
              <AnimatePresence>
                {appState === "listening" && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="flex items-center gap-2 text-blue-400 font-mono text-sm uppercase tracking-widest bg-blue-900/30 px-3 py-1 rounded-full backdrop-blur-sm border border-blue-500/20"
                  >
                    <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                    Receiving
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Center Visualizer (Fixed Full Screen Background) */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[-1] opacity-50">
          <Visualizer state={appState} />
        </div>

      </main>

      {/* Controls */}
      <footer className="absolute bottom-0 left-0 w-full flex flex-col items-center p-6 md:px-12 md:pb-10 z-20 shrink-0 pointer-events-none">
        <div className="w-full max-w-2xl flex items-center gap-3 pointer-events-auto">
          {/* Mic Toggle Button */}
          <button
            onClick={toggleListening}
            className={`
              flex-shrink-0 p-4 rounded-2xl transition-all duration-300 shadow-xl border
              ${isSessionActive 
                ? "bg-red-500 border-red-400 text-white animate-pulse" 
                : "bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 hover:scale-105"
              }
            `}
            title={isSessionActive ? "End Voice Session" : "Start Voice Session"}
          >
            {isSessionActive ? <MicOff size={24} /> : <Mic size={24} />}
          </button>

          {/* Chat Input Bar */}
          <div className="flex-1 flex flex-col gap-2">
            {selectedImage && (
              <div className="relative w-16 h-16 rounded-xl overflow-hidden border-2 border-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.4)] pointer-events-auto">
                <img src={selectedImage} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                <button 
                  onClick={() => setSelectedImage(null)}
                  className="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-bl-lg"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            )}
            <form 
              onSubmit={handleTextSubmit}
              className="flex items-center gap-2 bg-slate-900/40 border border-white/10 rounded-2xl p-1.5 pl-5 backdrop-blur-2xl shadow-2xl focus-within:border-cyan-500/50 transition-all group pointer-events-auto"
            >
              <input 
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={isSessionActive ? "POWER is listening..." : "Ask POWER anything..."}
                className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-white/30 text-sm md:text-base py-2 font-medium tracking-wide"
              />
              
              <input 
                type="file"
                ref={fileInputRef}
                onChange={handleImageSelect}
                accept="image/*"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`p-2 rounded-xl transition-all ${selectedImage ? 'text-cyan-400' : 'text-white/40 hover:text-white/70'}`}
              >
                <ImageIcon size={20} className={selectedImage ? "fill-cyan-400" : ""} />
              </button>

              <button 
                type="submit"
                disabled={(!textInput.trim() && !selectedImage) || appState === "processing"}
                className={`
                  p-3 rounded-xl transition-all
                  ${(textInput.trim() || selectedImage) && appState !== "processing"
                    ? "bg-cyan-500 text-white shadow-[0_0_15px_rgba(6,182,212,0.4)] hover:bg-cyan-400" 
                    : "bg-white/5 text-white/20 cursor-not-allowed"
                  }
                `}
              >
                {appState === "processing" ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
              </button>
            </form>
          </div>

          {/* Mute Button */}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className={`flex-shrink-0 p-4 rounded-2xl border transition-all ${isMuted ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
          </button>
        </div>
      </footer>
    </div>
  );
}
