import React from 'react';

interface SpinnerProps {
  className?: string;
}

const Spinner: React.FC<SpinnerProps> = ({ className = '' }) => {
  return (
    <div className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 ${className}`}>
      <div className="bg-white rounded-lg p-6 flex flex-col items-center space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="text-gray-700 font-medium">Processing image...</p>
      </div>
    </div>
  );
};

export default Spinner;
