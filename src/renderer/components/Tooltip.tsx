import React, { useState } from 'react';

interface TooltipProps {
  content: string;
  children: React.ReactElement;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'bottom',
}) => {
  const [visible, setVisible] = useState(false);

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  // Helper to determine arrow position
  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 -mt-1 border-t-zinc-800 dark:border-t-zinc-800 border-l-transparent border-r-transparent border-b-transparent',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 -mb-1 border-b-zinc-800 dark:border-b-zinc-800 border-l-transparent border-r-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 -ml-1 border-l-zinc-800 dark:border-l-zinc-800 border-t-transparent border-b-transparent border-r-transparent',
    right: 'right-full top-1/2 -translate-y-1/2 -mr-1 border-r-zinc-800 dark:border-r-zinc-800 border-t-transparent border-b-transparent border-l-transparent',
  };

  return (
    <div
      className="relative flex items-center"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onMouseDown={() => setVisible(false)} // Hide on click to avoid sticking
    >
      {children}
      {visible && (
        <div className={`absolute z-50 ${positionClasses[position]} pointer-events-none animate-in fade-in zoom-in-95 duration-100`}>
          <div className="relative bg-zinc-800 dark:bg-zinc-800 text-zinc-100 dark:text-zinc-100 text-[10px] font-semibold px-2 py-1 rounded shadow-md whitespace-nowrap border border-zinc-700/40">
            {content}
            {/* Minimal arrow decoration */}
            <div className={`absolute w-0 h-0 border-4 ${arrowClasses[position]}`} />
          </div>
        </div>
      )}
    </div>
  );
};
