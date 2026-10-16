import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Aperture, Sparkles, RefreshCw } from 'lucide-react';

interface StudioLoaderProps {
  onComplete?: () => void;
  duration?: number; // duration in ms
  isLoading?: boolean;
}

export const StudioLoader: React.FC<StudioLoaderProps> = ({ 
  onComplete, 
  duration = 2000,
  isLoading = false
}) => {
  const [progress, setProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('Initializing studio hardware...');
  const [isDone, setIsDone] = useState(false);

  // Dynamic professional photography workflow messages based on progress
  useEffect(() => {
    if (progress < 25) {
      setLoadingMessage('Initializing studio hardware...');
    } else if (progress < 50) {
      setLoadingMessage('Configuring camera lens clusters...');
    } else if (progress < 75) {
      setLoadingMessage('Preparing Your Creative Workspace...');
    } else if (progress < 90) {
      setLoadingMessage('Loading Studio Dashboard...');
    } else if (progress < 100) {
      setLoadingMessage('Synchronizing executive ledger data...');
    } else {
      setLoadingMessage('Workspace synchronized!');
    }
  }, [progress]);

  useEffect(() => {
    // Progress increment timer
    const interval = duration / 100;
    const progressTimer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressTimer);
          return 100;
        }

        // If the database is still loading, cap the progress at 90%
        if (isLoading && prev >= 90) {
          return 90;
        }

        // Increment the progress
        // If loading is done, accelerate progress to 100%
        const step = (!isLoading && prev >= 90) ? 5 : 1;
        const next = prev + step;
        return next > 100 ? 100 : next;
      });
    }, interval);

    return () => {
      clearInterval(progressTimer);
    };
  }, [duration, isLoading]);

  useEffect(() => {
    if (progress >= 100) {
      const doneTimer = setTimeout(() => {
        setIsDone(true);
        if (onComplete) {
          setTimeout(onComplete, 400); // allow exit animation to play
        }
      }, 200);
      return () => clearTimeout(doneTimer);
    }
  }, [progress, onComplete]);

  return (
    <AnimatePresence>
      {!isDone && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.02 }}
          transition={{ duration: 0.4, ease: 'easeInOut' }}
          id="studio_loader_overlay"
          className="fixed inset-0 z-50 bg-black flex flex-col justify-center items-center px-4 font-sans select-none overflow-hidden"
        >
          {/* Subtle cinematic background spotlight */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[800px] h-[800px] rounded-full bg-radial from-amber-500/5 to-transparent blur-[160px] pointer-events-none" />

          {/* Lens & Shutter Container */}
          <div className="relative mb-10 w-64 h-64 flex items-center justify-center">
            
            {/* Outer Focus Ring (Distance markings & Rotating dashes) */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 15, ease: 'linear' }}
              className="absolute inset-0 rounded-full border border-dashed border-zinc-800 flex items-center justify-center"
            >
              <div className="absolute -top-1 text-[8px] font-mono font-bold text-zinc-600 tracking-widest uppercase">AF-S</div>
              <div className="absolute -bottom-1 text-[8px] font-mono font-bold text-zinc-600 tracking-widest uppercase">85mm F/1.2</div>
              <div className="absolute -left-1 text-[8px] font-mono font-bold text-amber-500/40">Ø 82</div>
              <div className="absolute -right-1 text-[8px] font-mono font-bold text-zinc-600">∞</div>
            </motion.div>

            {/* Inner Metallic Focus Grip Ring */}
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ repeat: Infinity, duration: 25, ease: 'linear' }}
              className="absolute inset-4 rounded-full border-2 border-zinc-900 border-t-zinc-700/50"
            />

            {/* Lens Barrel Body */}
            <div className="absolute inset-8 rounded-full bg-gradient-to-b from-zinc-900 to-zinc-950 border border-zinc-800 shadow-2xl flex items-center justify-center overflow-hidden">
              
              {/* Glass Coating Reflections & Soft Lens Flares */}
              <div className="absolute inset-0 bg-radial from-transparent via-cyan-500/5 to-purple-500/10 pointer-events-none z-20" />
              <motion.div 
                animate={{ 
                  x: [-60, 60, -60], 
                  y: [-30, 30, -30],
                  opacity: [0.3, 0.6, 0.3] 
                }}
                transition={{ repeat: Infinity, duration: 8, ease: 'easeInOut' }}
                className="absolute inset-0 bg-gradient-to-tr from-transparent via-emerald-400/10 to-amber-400/5 blur-sm mix-blend-color-dodge z-20" 
              />
              <motion.div 
                animate={{ 
                  rotate: [0, 360],
                  scale: [1, 1.05, 1]
                }}
                transition={{ repeat: Infinity, duration: 12, ease: 'linear' }}
                className="absolute w-44 h-44 rounded-full border border-zinc-850/60 pointer-events-none z-10"
              />

              {/* Shutter Blades SVG Ring */}
              <div className="absolute inset-3 rounded-full bg-black flex items-center justify-center overflow-hidden">
                
                {/* Simulated Shutter Opening & Closing Motion */}
                <motion.svg
                  viewBox="0 0 100 100"
                  className="w-full h-full text-zinc-900"
                  animate={{
                    rotate: [0, 20, 0, -40, 0],
                    scale: [0.95, 1, 0.95, 1.02, 0.95]
                  }}
                  transition={{
                    repeat: Infinity,
                    duration: 5,
                    ease: 'easeInOut'
                  }}
                >
                  {/* Blade 1 */}
                  <motion.path
                    d="M 50 10 L 90 35 L 50 50 Z"
                    fill="#121214"
                    stroke="#1a1a1e"
                    strokeWidth="0.5"
                    animate={{ rotate: progress >= 95 ? 0 : [0, 4, -2, 1, 0] }}
                  />
                  {/* Blade 2 */}
                  <motion.path
                    d="M 90 50 L 65 90 L 50 50 Z"
                    fill="#151518"
                    stroke="#1a1a24"
                    strokeWidth="0.5"
                    animate={{ rotate: progress >= 95 ? 0 : [0, -3, 2, -1, 0] }}
                  />
                  {/* Blade 3 */}
                  <motion.path
                    d="M 50 90 L 10 65 L 50 50 Z"
                    fill="#121214"
                    stroke="#1a1a1e"
                    strokeWidth="0.5"
                    animate={{ rotate: progress >= 95 ? 0 : [0, 2, -4, 3, 0] }}
                  />
                  {/* Blade 4 */}
                  <motion.path
                    d="M 10 50 L 35 10 L 50 50 Z"
                    fill="#18181c"
                    stroke="#22222a"
                    strokeWidth="0.5"
                    animate={{ rotate: progress >= 95 ? 0 : [0, -4, 3, -2, 0] }}
                  />
                </motion.svg>

                {/* Photocrew Logo gradually developing as shutter blades open */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ 
                    opacity: progress > 30 ? (progress - 30) / 70 : 0.1, 
                    scale: progress > 30 ? 0.8 + ((progress - 30) / 70) * 0.2 : 0.8
                  }}
                  transition={{ ease: 'easeOut' }}
                  className="absolute inset-0 flex items-center justify-center p-8 z-30"
                >
                  <img
                    src="https://aqifyxsimhqayfjwzzwj.supabase.co/storage/v1/object/public/img/logo%20(4)%20(1).png"
                    alt="Photocrew Pictures Logo"
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 object-contain filter drop-shadow-[0_0_12px_rgba(245,158,11,0.4)]"
                  />
                </motion.div>
                
              </div>
            </div>

          </div>

          {/* Brand/Logo Title Text */}
          <div className="text-center space-y-4 max-w-sm z-10">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-mono font-black tracking-[0.3em] text-amber-500 block">
                PHOTOCREW PICTURES
              </span>
              <h2 className="text-xl font-bold font-sans text-white tracking-tight">
                STUDIO WORKSPACE
              </h2>
            </div>

            {/* Dynamic workflow status text */}
            <div className="h-6 flex items-center justify-center text-xs text-zinc-400 font-mono tracking-wide">
              <motion.span
                key={loadingMessage}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2 text-zinc-300"
              >
                <Aperture className="w-3.5 h-3.5 text-amber-500 animate-spin" />
                {loadingMessage}
              </motion.span>
            </div>

            {/* Premium Linear Progress Bar */}
            <div className="space-y-2 pt-1">
              <div className="w-full bg-zinc-950/80 border border-zinc-900 rounded-full h-1.5 overflow-hidden p-[1px]">
                <motion.div
                  initial={{ width: '0%' }}
                  animate={{ width: `${progress}%` }}
                  transition={{ ease: 'easeOut' }}
                  className="h-full bg-gradient-to-r from-amber-500 to-orange-505 rounded-full"
                />
              </div>
              <div className="flex justify-between items-center text-[9px] font-mono text-zinc-550">
                <span className="uppercase tracking-widest font-black text-zinc-500">SYSTEM READY</span>
                <span className="text-zinc-400 font-bold">{progress}%</span>
              </div>
            </div>
          </div>

          {/* Studio Watermark */}
          <div className="absolute bottom-8 left-8 right-8 flex justify-between items-center text-[10px] text-zinc-650 font-mono">
            <span>OPERATOR PORTAL</span>
            <span>SECURE TRANSCEIVER // LIVE</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
