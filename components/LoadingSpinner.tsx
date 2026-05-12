import React from 'react';

interface LoadingSpinnerProps {
  className?: string;
  dotClassName?: string;
  progress?: number;
  message?: string;
  versionStatus?: string; // e.g. "1/2"
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ className, dotClassName = 'w-2 h-2', progress, message, versionStatus }) => {
  const hasProgress = typeof progress === 'number';
  
  return (
    <div className={`relative flex flex-col items-center justify-center w-full ${className}`}>
      {/* Version Status in top-right corner of the container */}
      {versionStatus && (
        <div className="absolute top-0 right-0 px-3 py-1 bg-slate-100 dark:bg-slate-700 rounded-full text-xs font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
          File {versionStatus}
        </div>
      )}

      <div className="flex items-center space-x-2 mb-6">
        <div className={`${dotClassName} bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.3s]`}></div>
        <div className={`${dotClassName} bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.15s]`}></div>
        <div className={`${dotClassName} bg-emerald-500 rounded-full animate-bounce`}></div>
      </div>

      {hasProgress && (
        <div className="flex flex-col items-center w-full">
          <div className="text-4xl font-black text-slate-900 dark:text-white mb-2">
            {progress}%
          </div>
          
          <div className="w-full max-w-xs h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700/50 shadow-inner">
            <div 
              className="h-full bg-linear-to-r from-emerald-400 to-emerald-600 transition-all duration-1000 ease-out shadow-[0_0_12px_rgba(16,185,129,0.4)]"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          
          {message && (
            <div className="mt-4 text-sm font-medium text-slate-500 dark:text-slate-400 text-center animate-pulse tracking-wide">
              {message.toUpperCase()}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LoadingSpinner;
