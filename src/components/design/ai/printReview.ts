import type { AIValidation } from './types';

export const SPACING_EDIT = 'Give all text and logos more breathing room: move or reduce them proportionally inside the central 84% of the banner, at least 8% from every edge. Preserve every word, the lettering style, colors, and all unrelated artwork. Keep the background full bleed to every edge; do not add a border or blank padding.';

const FLAG_MESSAGES: Record<string, string> = {
  physicalBannerMockup: 'The artwork may include a pictured banner instead of just the design to print.',
  surroundingScene: 'Check for an unwanted scene around the banner artwork.',
  grommetsOrEyelets: 'The artwork may include drawn grommets that would be printed in the design.',
  mountingHardware: 'The artwork may include drawn mounting hardware.',
  foldsOrMaterialRipples: 'The artwork may include drawn folds or ripples.',
  frameOrBorder: 'Check whether the visible frame or border belongs in your design.',
  blankBarsOrLetterboxing: 'Check for unwanted blank strips around the artwork.',
  distortedComposition: 'Some artwork may look stretched or distorted.',
  clippedContent: 'Some text or important artwork may be cut off at the edge. Adjust the design before using it.',
  illegibleOrOverlappingText: 'Some text may overlap or be difficult to read.',
  unexpectedText: 'Check for extra wording you did not request.',
  logoMismatch: 'The logo may differ from the one you uploaded.',
  duplicateLogo: 'The artwork may contain an extra copy of your logo.',
};

// Also classify saved designs made before separate margin checks existed.
// Keep the original validation unchanged for diagnostics and order history.
export function getPrintReview(validation?: AIValidation) {
  const messages: string[] = [];
  if (!validation) return { requiresConfirmation: true, spacing: false, unavailable: true, messages: ['Review the full preview before using this design.'] };
  const { checks, vision } = validation;
  const flags = checks.flatArtwork.flags || [];
  const unavailable = !vision.available;
  const spacing = checks.safeMargins?.passed === false || flags.includes('importantContentOutsideSafeMargins');
  if (!checks.dimensions.passed || !checks.aspectRatio.passed) messages.push('The artwork dimensions do not match your selected banner size.');
  if (!checks.resolution.passed) messages.push('The image may look soft at this banner size.');
  if (!checks.edgeCoverage.passed) messages.push('Check for unwanted blank space along the edges.');
  if (!checks.exactText.passed && !unavailable) messages.push('Check the spelling and wording against your request.');
  const concerns = flags.filter(flag => !['importantContentOutsideSafeMargins', 'visionUnavailable'].includes(flag));
  concerns.forEach(flag => messages.push(FLAG_MESSAGES[flag] || 'Review the full preview for an artwork issue.'));
  if (!checks.flatArtwork.passed && !flags.length && !unavailable) messages.push('Review the full preview for an artwork issue.');
  if (!validation.passed && !messages.length && !spacing && !unavailable) messages.push('Review the full preview before using this design.');
  const requiresConfirmation = messages.length > 0;
  if (spacing) messages.push('Some text or artwork is close to the edge. Check the full preview, or give it more space before continuing.');
  if (unavailable) messages.push('The automatic visual check could not finish. Review the wording and layout in the full preview before continuing.');
  return { requiresConfirmation, spacing, unavailable, messages: [...new Set(messages)] };
}
