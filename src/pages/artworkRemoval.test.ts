import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

// Execute the actual page callback in isolation: loading the entire page would
// also initialize unrelated payment SDKs, routing, and canvas integrations.
function removalCallback(page: string, bindings: Record<string, unknown>) {
  const source = readFileSync(new URL(`./${page}.tsx`, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(`${page}.tsx`, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'removeArtwork' && node.initializer && ts.isCallExpression(node.initializer)) callback = node.initializer.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!callback) throw new Error('Artwork removal handler is missing');
  return new Function(...Object.keys(bindings), `return (${callback.getText(ast)});`)(...Object.values(bindings));
}

describe.each(['Design', 'GoogleAdsBanner'])('%s artwork removal', page => {
  it('invalidates pending work and clears retry sources before another artwork can be used', () => {
    const controller = new AbortController();
    const imageCleanup = vi.fn();
    const pdfCleanup = vi.fn();
    const bindings: Record<string, any> = {
      uploadGenerationRef: { current: 4 },
      activeUploadAbortControllerRef: { current: controller },
      activeUploadPromiseRef: { current: new Promise(() => {}) },
      activeUploadFileRef: { current: new File(['bytes'], 'artwork.png') },
      activePdfPreviewFileRef: { current: new File(['pdf'], 'artwork.pdf') },
      activeImagePreviewCleanupRef: { current: imageCleanup },
      activePdfPreviewCleanupRef: { current: pdfCleanup },
      uploadedFileRef: { current: { fileKey: 'previous-artwork' } },
      preparedPlacementRef: { current: { artifact: 'previous-proof' } },
    };
    for (const setter of ['setIsUploading', 'setPendingPlacementPreview', 'setUploadedFile', 'setFitUndo', 'setUploadProgress', 'setImgPos', 'setImgScale', 'setImgScaleY', 'setRestoredNormalizedTransform', 'setRestoredCompositionRevision', 'setUploadError', 'setAiPrompt', 'setAiEditPrompt', 'setAiDesignSession']) bindings[setter] = vi.fn();
    let generationAtAbort: number | undefined;
    controller.signal.addEventListener('abort', () => { generationAtAbort = bindings.uploadGenerationRef.current; });
    const remove = removalCallback(page, bindings);
    remove();
    expect(generationAtAbort).toBe(5);
    expect(controller.signal.aborted).toBe(true);
    for (const ref of ['activeUploadPromiseRef', 'activeUploadFileRef', 'activePdfPreviewFileRef', 'uploadedFileRef', 'preparedPlacementRef']) expect(bindings[ref].current).toBeNull();
    expect(bindings.setUploadedFile).toHaveBeenCalledWith(null);
    expect(bindings.setIsUploading).toHaveBeenCalledWith(false);
    expect(bindings.setFitUndo).toHaveBeenCalledWith(null);
    expect(imageCleanup).toHaveBeenCalledOnce();
    expect(pdfCleanup).toHaveBeenCalledOnce();
    remove();
    expect(imageCleanup).toHaveBeenCalledOnce();
    expect(pdfCleanup).toHaveBeenCalledOnce();
  });
});
