import React from 'react';
import { motion } from 'motion/react';

const ChibiButler: React.FC = () => {
  return (
    <div className="absolute -top-20 left-0 w-full h-20 pointer-events-none z-10 overflow-hidden">
      <motion.div
        initial={{ left: '-100px' }}
        animate={{ left: '100%' }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: "linear"
        }}
        className="absolute bottom-0 flex items-end"
      >
        {/* Chibi Butler Image */}
        <motion.div 
          className="relative w-16 h-20"
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <img
            src="/butler.png"
            alt="Chibi Butler"
            className="w-full h-full object-contain drop-shadow-xl mix-blend-multiply dark:mix-blend-normal"
            style={{ imageRendering: 'pixelated' }}
            onError={(e) => {
              // Fallback if image is not uploaded yet
              (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/butler/100/200';
            }}
          />
        </motion.div>
      </motion.div>
    </div>
  );
};

export default ChibiButler;
