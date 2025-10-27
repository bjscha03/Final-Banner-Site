import React, { useState } from 'react';
import { X, PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const HalloweenVideoTutorial: React.FC = () => {
  const [isVideoOpen, setIsVideoOpen] = useState(false);

  return (
    <>
      {/* Tutorial Banner */}
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg shadow-lg p-6 mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-white/20 rounded-full p-3">
              <PlayCircle className="w-8 h-8 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-1">
                🎃 How to Create a Halloween Banner with AI Tool
              </h3>
              <p className="text-orange-100 text-sm">
                Watch our quick tutorial to learn how to design the perfect Halloween banner
              </p>
            </div>
          </div>
          <Button
            onClick={() => setIsVideoOpen(true)}
            className="bg-white text-orange-600 hover:bg-orange-50 font-semibold px-6 py-3"
          >
            Watch Tutorial
          </Button>
        </div>
      </div>

      {/* Video Modal */}
      {isVideoOpen && (
        <div 
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setIsVideoOpen(false)}
        >
          <div 
            className="relative w-full max-w-5xl bg-black rounded-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setIsVideoOpen(false)}
              className="absolute top-4 right-4 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>

            {/* Video Player */}
            <div className="relative" style={{ paddingBottom: '56.25%' }}>
              <video
                className="absolute inset-0 w-full h-full"
                controls
                autoPlay
                src="https://res.cloudinary.com/dtrxl120u/video/upload/v1761607178/1EB157DF-0967-4E22-837B-43F0C187FB93_jrwno7.mov"
              >
                Your browser does not support the video tag.
              </video>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default HalloweenVideoTutorial;
