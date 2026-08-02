import fs from 'node:fs/promises';

const path = 'scripts/apply-direct-artwork-upload-recovery.mjs';
const source = await fs.readFile(path, 'utf8');
const startMarker = '  const uploadGuard = /';
const endMarker = "\n\n  block = block.replace(\n    '  }, [checkoutArtwork,'";
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0) {
  throw new Error('Could not locate the checkout upload-guard patch block.');
}

const replacement = `  const uploadGuard = /([ \\t]+)if \\(!\\(checkoutArtwork\\.productionUrl \\|\\| checkoutArtwork\\.fileKey\\) \\|\\| !\\(checkoutArtwork\\.productionPublicId \\|\\| checkoutArtwork\\.fileKey\\)\\) \\{\\n[ \\t]+toast\\(\\{\\n[ \\t]+title: 'Upload still processing',\\n[ \\t]+description: 'Please wait for the original artwork upload to finish before checkout\\.',\\n[ \\t]+variant: 'destructive',\\n[ \\t]+\\}\\);\\n[ \\t]+return;\\n[ \\t]+\\}/g;
  const guardMatches = [...block.matchAll(uploadGuard)];
  if (guardMatches.length < 1) {
    throw new Error(\`${'${path}'}: no upload guard was found\`);
  }
  block = block.replace(uploadGuard, (_match, indent) => \`${'${indent}'}checkoutArtwork = await ensurePermanentArtworkUploaded();\\n${'${indent}'}if (!checkoutArtwork) return;\`);`;

await fs.writeFile(path, source.slice(0, start) + replacement + source.slice(end), 'utf8');
console.log('[direct-upload-patch] made upload guard replacement indentation-safe');
