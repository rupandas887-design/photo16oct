import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Sparkles } from 'lucide-react';

interface AnimatedSalesGreetingProps {
  salesPersonName: string;
}

/**
 * Returns an appropriate time-of-day greeting based on the user's local time:
 * - 05:00 to 11:59 -> Good morning! 👋
 * - 12:00 to 16:59 -> Good afternoon! 👋
 * - 17:00 to 04:59 -> Good evening! 👋
 */
export const getTimeBasedGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return 'Good morning! 👋';
  }
  if (hour >= 12 && hour < 17) {
    return 'Good afternoon! 👋';
  }
  return 'Good evening! 👋';
};

export const AnimatedSalesGreeting: React.FC<AnimatedSalesGreetingProps> = ({
  salesPersonName,
}) => {
  // Extract user's first name if available and not a placeholder
  const { firstName, hasRealName } = useMemo(() => {
    const rolePlaceholders = [
      'Sales Team',
      'Operations Team',
      'Production Team',
      'Business Owner',
      'Operation Staff',
      'Operations Staff',
      'Production Staff',
      'Staff',
      'Admin',
      'User',
    ];
    if (!salesPersonName || rolePlaceholders.includes(salesPersonName.trim())) {
      return { firstName: '', hasRealName: false };
    }
    const trimmed = salesPersonName.trim();
    const parts = trimmed.split(/\s+/);
    return {
      firstName: parts[0] || '',
      hasRealName: true,
    };
  }, [salesPersonName]);

  // Dynamic time greeting updated per minute
  const [timeGreeting, setTimeGreeting] = useState<string>(() => getTimeBasedGreeting());
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeGreeting(getTimeBasedGreeting());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Personalized rotating welcome messages (Welcome back is first as required by spec)
  const welcomeMessages = useMemo(() => {
    if (hasRealName && firstName) {
      return [
        `Welcome back, ${firstName}!`,
        "Let's make today productive!",
        `Hi, ${firstName}! 👋`,
        'Ready for a great day?',
      ];
    }
    return [
      'Welcome back!',
      "Let's make today productive!",
      'Ready for a great day?',
    ];
  }, [hasRealName, firstName]);

  // Animation & rotation state
  const [msgIndex, setMsgIndex] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const hasMountedRef = useRef(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Check reduced motion setting
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      setPrefersReducedMotion(mediaQuery.matches);

      const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', listener);
        return () => mediaQuery.removeEventListener('change', listener);
      }
    }
  }, []);

  // Smooth rotation interval (only if user does not prefer reduced motion)
  useEffect(() => {
    if (prefersReducedMotion || welcomeMessages.length <= 1) return;

    const interval = setInterval(() => {
      setIsExiting(true);
      setTimeout(() => {
        setMsgIndex((prev) => (prev + 1) % welcomeMessages.length);
        setIsExiting(false);
      }, 300);
    }, 10000);

    return () => clearInterval(interval);
  }, [prefersReducedMotion, welcomeMessages.length]);

  // Track initial mount to prevent excessive replay on state re-renders
  const [isInitialEntrance, setIsInitialEntrance] = useState(true);
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      const timeout = setTimeout(() => {
        setIsInitialEntrance(false);
      }, 700);
      return () => clearTimeout(timeout);
    }
  }, []);

  const currentMessage = welcomeMessages[msgIndex] || welcomeMessages[0];

  return (
    <div
      className={`flex flex-col gap-0.5 select-none ${
        isInitialEntrance && !prefersReducedMotion
          ? 'animate-in fade-in slide-in-from-top-1.5 duration-500 ease-out'
          : ''
      }`}
    >
      {/* 1. Time-of-day greeting (e.g. Good afternoon! 👋) */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs sm:text-sm font-black text-amber-400 tracking-wide font-sans flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-400 inline-block animate-pulse shrink-0 motion-reduce:animate-none" />
          <span>{timeGreeting}</span>
        </span>
      </div>

      {/* 2. Animated Personalized Welcome (e.g. Hi, Soujanya!) with fixed height to prevent layout shifts */}
      <div className="h-5 sm:h-6 flex items-center overflow-hidden">
        <p
          className={`text-sm sm:text-base font-bold text-zinc-200 tracking-tight transition-all duration-300 ease-out motion-reduce:transition-none motion-reduce:transform-none ${
            isExiting && !prefersReducedMotion
              ? 'opacity-0 -translate-y-1'
              : 'opacity-100 translate-y-0'
          }`}
        >
          {currentMessage}
        </p>
      </div>
    </div>
  );
};
