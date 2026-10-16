import React, { useState } from 'react';
import { Aperture } from 'lucide-react';

interface AppLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showTextOnFallback?: boolean;
}

export const AppLogo: React.FC<AppLogoProps> = ({ 
  className = '', 
  size = 'md', 
  showTextOnFallback = true 
}) => {
  const [hasError, setHasError] = useState(false);
  const logoUrl = 'https://aqifyxsimhqayfjwzzwj.supabase.co/storage/v1/object/public/img/logo%20(4)%20(1).png';

  // Responsive class configurations
  let imageSizeClass = 'h-10 w-auto';
  let fallbackIconSizeClass = 'w-6.5 h-6.5';

  switch (size) {
    case 'sm':
      imageSizeClass = 'h-7.5 w-auto';
      fallbackIconSizeClass = 'w-4.5 h-4.5';
      break;
    case 'md':
      imageSizeClass = 'h-[42px] w-auto';
      fallbackIconSizeClass = 'w-6.5 h-6.5';
      break;
    case 'lg':
      imageSizeClass = 'h-[68px] sm:h-[74px] w-auto';
      fallbackIconSizeClass = 'w-11 h-11';
      break;
    case 'xl':
      imageSizeClass = 'h-28 sm:h-32 w-auto';
      fallbackIconSizeClass = 'w-18 h-18';
      break;
  }

  return (
    <div className={`inline-flex items-center justify-center ${className}`}>
      {!hasError ? (
        <img
          src={logoUrl}
          alt="Photo Crew ERP"
          className={`${imageSizeClass} object-contain max-w-full transition-all duration-300`}
          referrerPolicy="no-referrer"
          onError={() => setHasError(true)}
        />
      ) : (
        <div className="flex items-center gap-2">
          <div className="relative p-2 flex items-center justify-center">
            <Aperture className={`${fallbackIconSizeClass} text-amber-400 animate-[spin_6s_linear_infinite]`} />
          </div>
          {showTextOnFallback && (
            <span className="text-xs font-black tracking-[0.25em] text-zinc-100 font-mono">
              PHOTO CREW
            </span>
          )}
        </div>
      )}
    </div>
  );
};
