import React, { useState, useEffect } from 'react';
import { resolveStorageUrl } from '../../utils';
import { Loader2, AlertCircle, ExternalLink, RefreshCw } from 'lucide-react';

interface SafeProofImageProps {
  url: string | null | undefined;
  alt: string;
  label?: string;
  className?: string;
  containerClassName?: string;
  onClick?: () => void;
  showExternalLink?: boolean;
}

export const SafeProofImage: React.FC<SafeProofImageProps> = ({
  url,
  alt,
  label = 'View Full Photo',
  className = 'w-full h-full object-contain',
  containerClassName = 'relative group overflow-hidden rounded-lg border border-zinc-800 h-28 bg-zinc-900/80 flex items-center justify-center',
  onClick,
  showExternalLink = true
}) => {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const resolvedUrl = resolveStorageUrl(url);

  // Reset loading and error states whenever URL changes
  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
  }, [url]);

  if (!resolvedUrl || hasError) {
    return (
      <div className={`bg-zinc-900/60 border border-dashed border-zinc-800 rounded-lg flex flex-col items-center justify-center text-[11px] text-zinc-400 p-3 text-center gap-1.5 ${containerClassName.includes('h-') ? containerClassName.split(' ').filter(c => c.startsWith('h-')).join(' ') : 'h-28'}`}>
        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
        <span className="font-mono text-zinc-400 font-semibold">Proof image not accessible</span>
        {resolvedUrl ? (
          <div className="flex items-center gap-2 mt-1">
            <button
              type="button"
              onClick={() => {
                setHasError(false);
                setIsLoading(true);
              }}
              className="inline-flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300 font-bold underline cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
            <a
              href={resolvedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] text-sky-400 hover:text-sky-300 font-bold underline"
            >
              <ExternalLink className="w-3 h-3" /> Direct link
            </a>
          </div>
        ) : (
          <span className="text-[10px] text-zinc-500">No valid URL provided</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1 w-full">
      <div 
        onClick={onClick}
        className={`${containerClassName} ${onClick ? 'cursor-pointer' : ''}`}
      >
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/95 text-zinc-400 text-[10px] font-mono gap-1.5 z-10">
            <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
            <span>Loading proof image...</span>
          </div>
        )}
        <img 
          src={resolvedUrl} 
          alt={alt} 
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
          className={`${className} transition-all duration-200 ${isLoading ? 'opacity-0' : 'opacity-100 group-hover:scale-105'}`} 
        />
        {!isLoading && !hasError && showExternalLink && !onClick && (
          <a 
            href={resolvedUrl} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition-opacity z-20 gap-1"
          >
            <span>{label}</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
};
