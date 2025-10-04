import React, { useState } from 'react';
import { logPdfDiagnostics, runPdfDiagnostics, DiagnosticResult } from '@/utils/pdf/diagnosticPdfTest.ts';

export default function PdfDiagnostic() {
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
      setResults([]);
    }
  };

  const runDiagnostics = async () => {
    if (!selectedFile) return;
    
    setIsRunning(true);
    setResults([]);
    
    try {
      // Run diagnostics and log to console
      await logPdfDiagnostics(selectedFile);
      
      // Get results for UI display
      const diagnosticResults = await runPdfDiagnostics(selectedFile);
      setResults(diagnosticResults);
    } catch (error) {
      console.error('Diagnostic error:', error);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">PDF.js Diagnostic Tool</h1>
      
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Upload PDF for Testing</h2>
        
        <input
          type="file"
          accept=".pdf"
          onChange={handleFileSelect}
          className="mb-4 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
        
        {selectedFile && (
          <div className="mb-4 p-3 bg-gray-50 rounded">
            <p><strong>File:</strong> {selectedFile.name}</p>
            <p><strong>Size:</strong> {(selectedFile.size / 1024).toFixed(1)} KB</p>
            <p><strong>Type:</strong> {selectedFile.type}</p>
          </div>
        )}
        
        <button
          onClick={runDiagnostics}
          disabled={!selectedFile || isRunning}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {isRunning ? 'Running Diagnostics...' : 'Run PDF Diagnostics'}
        </button>
      </div>

      {isRunning && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600 mr-2"></div>
            <span>Running diagnostic tests... Check console for detailed logs.</span>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Diagnostic Results</h2>
          
          <div className="space-y-4">
            {results.map((result, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border ${
                  result.success 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-lg">
                    {index + 1}. {result.strategy}
                  </h3>
                  <span className={`px-2 py-1 rounded text-sm font-medium ${
                    result.success 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {result.success ? '✅ Success' : '❌ Failed'}
                  </span>
                </div>
                
                <div className="text-sm text-gray-600 space-y-1">
                  <p><strong>Render Time:</strong> {result.renderTime}ms</p>
                  
                  {result.success ? (
                    <>
                      <p><strong>Pages:</strong> {result.details?.pages}</p>
                      <p><strong>Viewport:</strong> {result.details?.viewport?.width}×{result.details?.viewport?.height}</p>
                    </>
                  ) : (
                    <>
                      <p><strong>Error:</strong> {result.error}</p>
                      <p><strong>Error Type:</strong> {result.details?.errorType}</p>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h3 className="font-semibold text-blue-900 mb-2">Summary</h3>
            <p className="text-blue-800">
              {results.filter(r => r.success).length} out of {results.length} strategies succeeded.
              {results.some(r => r.success) && (
                <span className="block mt-1">
                  <strong>Recommended:</strong> Use "{results.find(r => r.success)?.strategy}" configuration.
                </span>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
