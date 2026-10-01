import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import CreateWithAIModal from '../../src/components/design/CreateWithAIModal';
import type { AIDesignSession, CreateWithAIResult } from '../../src/components/design/ai/types';
import '../../src/index.css';

declare global { interface Window { __aiEditSession: AIDesignSession } }

export function Harness() {
  const [open, setOpen] = useState(true);
  const [result, setResult] = useState<CreateWithAIResult | null>(null);
  return <>
    <button onClick={() => setOpen(true)}>Reopen banner studio</button>
    <output data-testid="applied-version">{result?.session.selectedConcept.versionId || ''}</output>
    <CreateWithAIModal open={open} onOpenChange={setOpen} productType="banner" widthIn={72} heightIn={36} material="13oz" initialSession={window.__aiEditSession} onGenerated={setResult} />
  </>;
}

createRoot(document.getElementById('root')!).render(<Harness />);
