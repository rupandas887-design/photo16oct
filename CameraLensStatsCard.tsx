import React, { useState, useEffect } from 'react';
import { Camera } from 'lucide-react';

export const MicroSparkline: React.FC<{ points?: number[]; color: string }> = ({ points = [10, 15, 12, 18, 14, 20, 16], color }) => {
  const safePoints = Array.isArray(points) && points.length > 1 ? points : [10, 15, 12, 18, 14, 20, 16];
  const width = 120;
  const height = 18;
  const max = Math.max(...safePoints, 1);
  const min = Math.min(...safePoints, 0);
  const range = max - min || 1;
  
  const widthStep = width / (safePoints.length - 1);
  const svgPoints = safePoints.map((p, i) => {
    const x = i * widthStep;
    const y = height - ((p - min) / range) * (height - 4) - 2;
    return { x, y };
  });

  const pathD = svgPoints.reduce((acc, p, i) => {
    return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
  }, '');
  const areaD = `${pathD} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible opacity-45 group-hover/card:opacity-90 transition-opacity duration-300">
      <defs>
        <linearGradient id={`spark-glow-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#spark-glow-${color.replace('#', '')})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

export const LiveAnimateCounter: React.FC<{ value: number }> = ({ value }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = value;
    if (end === 0) {
      setCount(0);
      return;
    }
    const duration = 1200; // ms
    const increment = Math.max(1, Math.ceil(end / (duration / 16)));
    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(start);
      }
    }, 16);
    return () => clearInterval(timer);
  }, [value]);

  return <span className="font-mono font-black">{count}</span>;
};

export type CameraLensTheme = 'purple' | 'blue' | 'cyan' | 'green' | 'gold' | 'orange' | 'red' | 'amber' | 'emerald' | 'indigo';

export interface CameraLensStatsCardProps {
  label: string;
  val: number;
  theme: CameraLensTheme;
  trendText?: string;
  subText?: string;
  chartPoints?: number[];
  isCurrency?: boolean;
  isPercentage?: boolean;
  currencyFormatter?: (v: number) => string;
  activeFilterValue?: string;
  currentFilterValue?: string;
  onClick?: () => void;
  lensLabel?: string;
}

export const CameraLensStatsCard: React.FC<CameraLensStatsCardProps> = ({
  label,
  val,
  theme,
  trendText = 'Live Monitoring',
  subText = 'AF Focus',
  chartPoints = [10, 15, 12, 19, 14, 25, 23],
  isCurrency = false,
  isPercentage = false,
  currencyFormatter,
  activeFilterValue,
  currentFilterValue,
  onClick,
  lensLabel = 'PRIME 50mm'
}) => {
  const themeConfig: Record<CameraLensTheme, { color: string; borderClass: string; textClass: string; innerGlow: string; sparkColor: string; ringColor: string }> = {
    purple: {
      color: '#a855f7',
      borderClass: 'hover:border-purple-500/40 hover:shadow-[0_0_30px_rgba(168,85,247,0.18)]',
      textClass: 'text-purple-400',
      innerGlow: 'from-purple-950/80 via-zinc-950 to-indigo-900/30',
      sparkColor: '#a855f7',
      ringColor: 'border-purple-500/20'
    },
    blue: {
      color: '#3b82f6',
      borderClass: 'hover:border-blue-500/40 hover:shadow-[0_0_30px_rgba(59,130,246,0.18)]',
      textClass: 'text-blue-400',
      innerGlow: 'from-blue-950/80 via-zinc-950 to-cyan-900/30',
      sparkColor: '#3b82f6',
      ringColor: 'border-blue-500/20'
    },
    cyan: {
      color: '#06b6d4',
      borderClass: 'hover:border-cyan-500/40 hover:shadow-[0_0_30px_rgba(6,182,212,0.18)]',
      textClass: 'text-cyan-400',
      innerGlow: 'from-cyan-950/80 via-zinc-950 to-teal-900/30',
      sparkColor: '#06b6d4',
      ringColor: 'border-cyan-500/20'
    },
    green: {
      color: '#10b981',
      borderClass: 'hover:border-emerald-500/40 hover:shadow-[0_0_30px_rgba(16,185,129,0.18)]',
      textClass: 'text-emerald-400',
      innerGlow: 'from-emerald-950/80 via-zinc-950 to-teal-900/30',
      sparkColor: '#10b981',
      ringColor: 'border-emerald-500/20'
    },
    gold: {
      color: '#fbbf24',
      borderClass: 'hover:border-amber-500/40 hover:shadow-[0_0_30px_rgba(245,158,11,0.18)]',
      textClass: 'text-amber-400',
      innerGlow: 'from-amber-950/80 via-zinc-950 to-yellow-950/30',
      sparkColor: '#fbbf24',
      ringColor: 'border-amber-500/20'
    },
    orange: {
      color: '#f97316',
      borderClass: 'hover:border-orange-500/40 hover:shadow-[0_0_30px_rgba(249,115,22,0.18)]',
      textClass: 'text-orange-400',
      innerGlow: 'from-orange-950/80 via-zinc-950 to-red-950/30',
      sparkColor: '#f97316',
      ringColor: 'border-orange-500/20'
    },
    red: {
      color: '#f43f5e',
      borderClass: 'hover:border-rose-500/40 hover:shadow-[0_0_30px_rgba(244,63,94,0.18)]',
      textClass: 'text-rose-400',
      innerGlow: 'from-rose-950/80 via-zinc-950 to-red-900/30',
      sparkColor: '#f43f5e',
      ringColor: 'border-rose-500/20'
    },
    amber: {
      color: '#f59e0b',
      borderClass: 'hover:border-amber-500/40 hover:shadow-[0_0_30px_rgba(245,158,11,0.18)]',
      textClass: 'text-amber-400',
      innerGlow: 'from-amber-950/80 via-zinc-950 to-orange-950/30',
      sparkColor: '#f59e0b',
      ringColor: 'border-amber-500/20'
    },
    emerald: {
      color: '#10b981',
      borderClass: 'hover:border-emerald-500/40 hover:shadow-[0_0_30px_rgba(16,185,129,0.18)]',
      textClass: 'text-emerald-400',
      innerGlow: 'from-emerald-950/80 via-zinc-950 to-green-950/30',
      sparkColor: '#10b981',
      ringColor: 'border-emerald-500/20'
    },
    indigo: {
      color: '#6366f1',
      borderClass: 'hover:border-indigo-500/40 hover:shadow-[0_0_30px_rgba(99,102,241,0.18)]',
      textClass: 'text-indigo-400',
      innerGlow: 'from-indigo-950/80 via-zinc-950 to-purple-950/30',
      sparkColor: '#6366f1',
      ringColor: 'border-indigo-500/20'
    }
  };

  const currentTheme = themeConfig[theme] || themeConfig['purple'];

  const displayVal = isCurrency && currencyFormatter
    ? currencyFormatter(val)
    : isPercentage
      ? `${val}%`
      : val;

  const isFiltered = activeFilterValue !== undefined && currentFilterValue !== undefined && activeFilterValue === currentFilterValue;

  // Dynamically scale counts when they become large to protect from text overflow / clipping
  const valStr = String(displayVal);
  let valSizeClass = "text-lg sm:text-xl lg:text-xl xl:text-2xl";
  if (valStr.length >= 12) {
    valSizeClass = "text-xs sm:text-sm md:text-xs lg:text-sm xl:text-base";
  } else if (valStr.length >= 8) {
    valSizeClass = "text-sm sm:text-base md:text-sm lg:text-base xl:text-lg";
  } else if (valStr.length >= 5) {
    valSizeClass = "text-base sm:text-lg md:text-base lg:text-lg xl:text-xl";
  } else if (valStr.length <= 3) {
    valSizeClass = "text-xl sm:text-2xl md:text-xl lg:text-2xl xl:text-3xl";
  }

  return (
    <div 
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      } : undefined}
      className={`bg-zinc-950/75 backdrop-blur-xl border ${
        isFiltered 
          ? 'border-zinc-500 shadow-[0_0_20px_rgba(255,255,255,0.08)] scale-[0.98]' 
          : onClick 
            ? 'border-zinc-850 hover:border-zinc-700/80 shadow-md hover:shadow-xl' 
            : 'border-zinc-900'
      } rounded-2xl p-3 sm:p-4 flex flex-col justify-between transition-all duration-300 select-none ${
        currentTheme.borderClass
      } group/card ${
        onClick ? 'cursor-pointer hover:-translate-y-1 active:scale-[0.98]' : ''
      } relative overflow-hidden h-full min-h-[152px] sm:min-h-[160px] gap-2.5 sm:gap-3`}
    >
      {/* Premium subtle glass light strike overlay */}
      <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.01] to-white/[0.04] opacity-50 pointer-events-none" />
      
      {/* Interactive underlying neon spot glow */}
      <div className="absolute -right-6 -bottom-6 w-24 h-24 rounded-full blur-[28px] pointer-events-none opacity-10 transition-all duration-500 group-hover/card:scale-150 group-hover/card:opacity-25" style={{ backgroundColor: currentTheme.color }} />

      {/* Main Grid: Left Lens Representation & Right Metrics Section */}
      <div className="flex items-start gap-2.5 sm:gap-3 z-10 w-full text-left">
        
        {/* LEFT COMPASS: DSLR CAMERA LENS EMBED */}
        <div className="relative w-9 h-9 sm:w-11 sm:h-11 md:w-10 md:h-10 lg:w-11 lg:h-11 xl:w-12 xl:h-12 flex items-center justify-center shrink-0 select-none group/lens mt-0.5">
          {/* 3D Camera Lens Outer Barrel */}
          <div className="absolute inset-0 rounded-full border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 flex items-center justify-center p-0.5 shadow-xl ring-1 ring-white/5 transition-all duration-700 group-hover/card:scale-105 group-hover/card:border-zinc-700">
            
            {/* Physical outer focus notched ring elements */}
            <div className={`absolute inset-0.5 rounded-full border border-dashed animate-[spin_50s_linear_infinite] group-hover/card:rotate-90 group-hover/card:duration-1000 transition-all duration-700 ${currentTheme.ringColor}`} />
            
            {/* Core focusing notch ticks */}
            <div className="absolute inset-1 rounded-full border border-zinc-900/70 opacity-60 flex items-center justify-center">
              <div className="absolute top-0 w-0.5 h-1 bg-zinc-600" />
              <div className="absolute bottom-0 w-0.5 h-1 bg-zinc-600" />
              <div className="absolute left-0 h-0.5 w-1 bg-zinc-600" />
              <div className="absolute right-0 h-0.5 w-1 bg-zinc-600" />
            </div>

            {/* Inner lens element barrel */}
            <div className="absolute inset-1.5 sm:inset-2 rounded-full border border-zinc-900/90 bg-zinc-940 flex items-center justify-center overflow-hidden">
              
              {/* Aperture Blades Graphic */}
              <div className="absolute inset-0 opacity-[0.22] group-hover/card:opacity-[0.38] transition-all duration-700">
                <svg viewBox="0 0 100 100" className="w-full h-full text-zinc-600 group-hover/card:rotate-45 group-hover/card:scale-95 transition-all duration-700">
                  <polygon points="50,0 75,25 35,50 15,25" fill="none" stroke="currentColor" strokeWidth="0.8" />
                  <polygon points="75,25 100,50 60,65 50,25" fill="none" stroke="currentColor" strokeWidth="0.8" />
                  <polygon points="100,50 75,100 40,75 50,55" fill="none" stroke="currentColor" strokeWidth="0.8" />
                  <polygon points="75,100 25,100 35,60 50,75" fill="none" stroke="currentColor" strokeWidth="0.8" />
                  <polygon points="25,100 0,50 40,35 50,75" fill="none" stroke="currentColor" strokeWidth="0.8" />
                  <polygon points="0,50 25,0 60,35 50,25" fill="none" stroke="currentColor" strokeWidth="0.8" />
                </svg>
              </div>

              {/* Glass reflection gradient theme */}
              <div className={`absolute inset-1 sm:inset-1.5 rounded-full bg-gradient-to-br transition-all duration-500 flex items-center justify-center ${currentTheme.innerGlow}`}>
                
                {/* Viewfinder crosshairs */}
                <div className="absolute inset-0 pointer-events-none opacity-20 group-hover/card:opacity-40 transition-opacity">
                  <div className="absolute top-1/2 left-0 w-full h-[0.5px] bg-white/40" />
                  <div className="absolute left-1/2 top-0 h-full w-[0.5px] bg-white/40" />
                  <div className="absolute inset-1 sm:inset-2 border border-dashed border-white/20 rounded-full animate-[spin_100s_linear_infinite]" />
                </div>

                {/* Glass reflection overlay */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-transparent via-white/5 to-white/15 opacity-80 mix-blend-overlay pointer-events-none group-hover/card:scale-110 group-hover/card:-rotate-12 transition-all duration-1000" />
                
                {/* Flare reflections */}
                <div className="absolute top-0.5 left-1 w-3 h-1 bg-white/20 blur-[0.5px] rounded-full rotate-[-20deg] pointer-events-none group-hover/card:translate-x-0.5 transition-transform" />
                <div className="absolute bottom-1 right-1 w-2 h-0.5 bg-white/10 blur-[0.5px] rounded-full pointer-events-none" />

                {/* Floating spec text label on hover */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/lens:opacity-100 bg-zinc-950/80 transition-opacity duration-300 rounded-full p-0.5 pointer-events-none">
                  <span className="text-[5px] font-mono leading-none font-bold text-center text-zinc-400 tracking-widest uppercase">{lensLabel}</span>
                </div>

                {/* Center Icon fallback */}
                <Camera className="w-3 h-3 text-zinc-500 opacity-60 group-hover/card:scale-110 group-hover/card:text-zinc-300 transition-all duration-500" />
              </div>

            </div>

          </div>
        </div>

        {/* CENTER SEGMENT: METRICS TITLE AND DIGIT CONTROLLER */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-start justify-between gap-1.5 w-full">
            <span className="text-[10px] sm:text-[11px] font-bold tracking-wider text-zinc-400 uppercase font-sans group-hover/card:text-zinc-200 transition-colors duration-300 leading-snug break-words">
              {label}
            </span>
            {isFiltered ? (
              <span className="text-[8px] bg-white/10 border border-white/10 text-white rounded px-1.5 py-0.5 tracking-widest font-mono uppercase shrink-0 mt-0.5">
                Filter
              </span>
            ) : onClick ? (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-900/90 border border-zinc-800 text-zinc-400 group-hover/card:text-white group-hover/card:border-zinc-600 group-hover/card:bg-zinc-850 transition-all shadow-sm shrink-0 mt-0.5">
                <span>View</span>
                <span className="text-[10px] leading-none transition-transform group-hover/card:translate-x-0.5 group-hover/card:-translate-y-0.5">↗</span>
              </span>
            ) : null}
          </div>
          <div className="flex items-baseline select-none py-0.5">
            <span className={`${valSizeClass} font-black text-white tracking-tight group-hover/card:scale-[1.02] transition-transform duration-300 origin-left block whitespace-nowrap tabular-nums max-w-full leading-tight`}>
              {isCurrency || isPercentage ? (
                <span>{displayVal}</span>
              ) : (
                <LiveAnimateCounter value={val} />
              )}
            </span>
          </div>
        </div>

      </div>

      {/* BOTTOM SEGMENT: SPARKLINE TREND GRAPH & CALIBRATION CODES */}
      <div className="mt-auto pt-2 border-t border-zinc-900/60 flex items-center justify-between gap-2 z-10 w-full">
        <div className="w-auto flex-1 max-w-[110px] overflow-hidden">
          <MicroSparkline points={chartPoints} color={currentTheme.sparkColor} />
        </div>
        <div className="flex items-center gap-1 shrink-0 text-[8px] font-mono font-medium text-zinc-500 uppercase tracking-wider py-0.5 truncate">
          <span className="w-1 h-1 rounded-full animate-ping shrink-0" style={{ backgroundColor: currentTheme.color }} />
          <span className="truncate">{trendText}</span>
        </div>
      </div>
    </div>
  );
};
