import test from 'node:test';
import assert from 'node:assert/strict';
import {introTemplateVeto} from './discovery.mjs';

test('blocks generic supporting-signage template without reviewer approval',()=>{
 assert.match(introTemplateVeto('Supporting Picerne Group signage needs','Would a quick chat help?'),/Generic/);
});
test('blocks unsupported generic assumption and broad ask',()=>{
 assert.match(introTemplateVeto('Apartment banners','Your portfolio must keep your signage diverse. Would this be helpful?'),/Vague/);
});
test('blocks two questions and questionless pitches',()=>{
 assert.match(introTemplateVeto('Entrance vinyl banner','Would a mockup help? Can we chat?'),/Exactly one/);
 assert.match(introTemplateVeto('Entrance vinyl banner','We offer vinyl banners.'),/Exactly one/);
});
test('specific hypothetical use remains subject to independent review',()=>{
 assert.equal(introTemplateVeto('Resident entrance vinyl banner','For the community events described on your website, a vinyl entrance banner could mark the guest check-in area. Would a simple entrance layout mockup be useful?'),null);
});
