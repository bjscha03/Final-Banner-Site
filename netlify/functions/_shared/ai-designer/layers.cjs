'use strict';

const FONTS = ['DejaVu Sans', 'DejaVu Serif', 'Arial', 'Verdana', 'Georgia', 'Impact', 'Trebuchet MS'];
const ROLES = ['businessName', 'headline', 'supportingText', 'offer', 'callToAction', 'phone', 'website', 'address', 'date', 'other', 'logo', 'photo0', 'photo1', 'photo2'];
function normalizeLayers(input = {}) {
  const output = {};
  for (const role of ROLES) {
    const source = input?.[role];
    if (!source || typeof source !== 'object') continue;
    const layer = {};
    for (const [key, min, max] of [['x', 0.05, 0.95], ['y', 0.05, 0.95], ['scale', 0.25, 3], ['width', 0.1, 0.9]]) {
      if (source[key] != null && Number.isFinite(Number(source[key]))) layer[key] = Math.max(min, Math.min(max, Number(source[key])));
    }
    if (/^#[a-f0-9]{6}$/i.test(source.color || '')) layer.color = source.color;
    if (FONTS.includes(source.font)) layer.font = source.font;
    output[role] = layer;
  }
  return output;
}
function mergeLayerEdits(current, requested) {
  const result = normalizeLayers(current);
  for (const [role, patch] of Object.entries(normalizeLayers(requested))) {
    result[role] = { ...result[role], ...patch };
  }
  return result;
}

function removePhotoLayers(layers, count, removed) {
  const result = normalizeLayers(layers);
  for (const role of ['photo0', 'photo1', 'photo2']) delete result[role];
  let next = 0;
  for (let index = 0; index < count; index += 1) {
    if (removed.includes(index)) continue;
    if (layers?.[`photo${index}`]) result[`photo${next}`] = normalizeLayers(layers)[`photo${index}`];
    next += 1;
  }
  return result;
}
module.exports = { FONTS, ROLES, normalizeLayers, mergeLayerEdits, removePhotoLayers };
