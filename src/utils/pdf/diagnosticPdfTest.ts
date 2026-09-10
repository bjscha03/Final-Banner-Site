// Comprehensive PDF.js diagnostic test to identify parsing issues
import { GlobalWorkerOptions } from 'pdfjs-dist';

GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

export interface DiagnosticResult {
  strategy: string;
  success: boolean;
  error?: string;
  details?: any;
  renderTime?: number;
}

export async function runPdfDiagnostics(file: File): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];
  
  // Strategy 1: Current configuration (baseline)
  results.push(await testStrategy('Current Config', file, {
    verbosity: 0,
    isEvalSupported: false,
    disableFontFace: false,
    useSystemFonts: true,
    stopAtErrors: false,
    maxImageSize: 16777216,
    disableAutoFetch: false,
    disableStream: false,
    ignoreErrors: true,
  }));

  // Strategy 2: Ultra-permissive (ignore everything)
  results.push(await testStrategy('Ultra Permissive', file, {
    verbosity: 0,
    isEvalSupported: true, // Allow eval
    disableFontFace: true, // Disable fonts completely
    useSystemFonts: false,
    stopAtErrors: false,
    maxImageSize: -1, // No limit
    disableAutoFetch: true,
    disableStream: true,
    disableRange: true,
    ignoreErrors: true,
    useWorkerFetch: false,
    isOffscreenCanvasSupported: false,
  }));

  // Strategy 3: Minimal features (disable advanced features)
  results.push(await testStrategy('Minimal Features', file, {
    verbosity: 0,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: false,
    ignoreErrors: true,
    disableAutoFetch: true,
    disableStream: true,
    disableRange: true,
    useWorkerFetch: false,
  }));

  // Strategy 4: Legacy compatibility mode
  results.push(await testStrategy('Legacy Mode', file, {
    verbosity: 0,
    isEvalSupported: false,
    disableFontFace: false,
    useSystemFonts: true,
    stopAtErrors: true, // Be strict
    ignoreErrors: false, // Don't ignore errors
  }));

  // Strategy 5: Stream disabled (for corrupted stream data)
  results.push(await testStrategy('No Streaming', file, {
    verbosity: 0,
    disableStream: true,
    disableRange: true,
    disableAutoFetch: true,
    ignoreErrors: true,
    stopAtErrors: false,
  }));

  return results;
}

async function testStrategy(strategyName: string, file: File, config: any): Promise<DiagnosticResult> {
  const startTime = Date.now();
  
  try {
    console.log(`Testing strategy: ${strategyName}`);
    
    const _pdfjsLib = await import('pdfjs-dist');
    const arrayBuffer = await file.arrayBuffer();
    
    const loadingTask = (_pdfjsLib as any).getDocument({
      data: arrayBuffer,
      ...config
    });
    
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 0.5 }); // Small scale for testing
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    await page.render({ canvasContext: context, viewport }).promise;
    
    await pdf.destroy();
    
    const renderTime = Date.now() - startTime;
    
    return {
      strategy: strategyName,
      success: true,
      renderTime,
      details: {
        pages: pdf.numPages,
        viewport: { width: viewport.width, height: viewport.height }
      }
    };
    
  } catch (error) {
    const renderTime = Date.now() - startTime;
    
    return {
      strategy: strategyName,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      renderTime,
      details: {
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        stack: error instanceof Error ? error.stack : undefined
      }
    };
  }
}

// Helper function to run diagnostics and log results
export async function logPdfDiagnostics(file: File): Promise<void> {
  console.log('🔍 Running PDF diagnostics for:', file.name);
  console.log('File size:', file.size, 'bytes');
  console.log('File type:', file.type);
  
  const results = await runPdfDiagnostics(file);
  
  console.log('\n📊 Diagnostic Results:');
  console.log('='.repeat(50));
  
  results.forEach((result, index) => {
    console.log(`\n${index + 1}. ${result.strategy}`);
    console.log(`   Success: ${result.success ? '✅' : '❌'}`);
    console.log(`   Time: ${result.renderTime}ms`);
    
    if (result.success) {
      console.log(`   Pages: ${result.details?.pages}`);
      console.log(`   Viewport: ${result.details?.viewport?.width}x${result.details?.viewport?.height}`);
    } else {
      console.log(`   Error: ${result.error}`);
      console.log(`   Type: ${result.details?.errorType}`);
    }
  });
  
  const successfulStrategies = results.filter(r => r.success);
  
  if (successfulStrategies.length > 0) {
    console.log(`\n🎉 Found ${successfulStrategies.length} working strategies!`);
    console.log('Best strategy:', successfulStrategies[0].strategy);
  } else {
    console.log('\n❌ No strategies worked. PDF may be severely corrupted or use unsupported features.');
  }
}
