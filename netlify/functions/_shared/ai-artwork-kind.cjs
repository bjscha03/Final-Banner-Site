'use strict';
const AI_FILENAME = /^ai-(?:fit|banner)-\d+(?:\.\d+)?x\d+(?:\.\d+)?-.+\.(?:jpe?g|png)$/i;
function isAiArtwork(item) {
  return AI_FILENAME.test(item?.artwork_manifest?.originalFilename || item?.original_filename || item?.file_name || '');
}
module.exports = { isAiArtwork };
