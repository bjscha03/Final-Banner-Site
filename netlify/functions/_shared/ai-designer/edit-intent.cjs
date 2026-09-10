'use strict';

// Only recognize a standalone request to remove the uploaded layer. Mixed
// requests and requests targeting generated artwork still need the edit planner.
function isUploadedLogoRemoval(instruction, hasUploadedLogo) {
  if (!hasUploadedLogo) return false;
  const text = String(instruction || '').toLowerCase().trim()
    .replace(/[.!?]+$/, '').replace(/\s+/g, ' ')
    .replace(/^(?:please |can you |could you )+/, '')
    .replace(/,? please$/, '');
  return /^(?:remove|delete|clear|take off) (?:only |just )?(?:(?:the|my|this|that) )?(?:(?:attached|uploaded|original|protected) )?logo(?: overlay| layer| attachment| (?:that )?i (?:attached|uploaded|added))?(?: only)?$/.test(text);
}

module.exports = { isUploadedLogoRemoval };
