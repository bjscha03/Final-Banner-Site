export function followupQualityIssues(body='') {
 const text=String(body),issues=[];
 if(/^\s*(?:hi|hello|dear)\s+operations(?:\s+team)?\s*[,!:]/i.test(text)) issues.push('Use a natural verified company greeting, not the generic Operations team opener.');
 if(/\bjust\s+(?:checking(?:\s+in)?|following\s+up)\b|\bhad a chance to (?:consider|review|look)\b/i.test(text)) issues.push('Remove the boilerplate checking-in opener. Lead with one useful company-relevant application.');
 if(/\b(?:how|process|vendor)[\s\S]{0,100}\b(?:coordinate|manage|manages|management|signage production|signage orders)\b|\b(?:coordinate|manage|manages|management)[\s\S]{0,100}\b(?:signage|banners?|orders?|process)\b|\bpreferred (?:process|vendor)\b/i.test(text)) issues.push('Do not repeat a purchasing/process/vendor survey. Offer a concrete signage application instead.');
 if(/\bstreamlin(?:e|ing)\b|\btailor our (?:support|service)\b/i.test(text)) issues.push('Remove generic streamlining/tailoring claims; name the specific practical idea.');
 if(/\b(?:sample materials|samples?|free proofs?|mockups?|mock-ups?|custom design service)\b/i.test(text)) issues.push('Do not offer samples, proofs, mockups or design work that are not approved capabilities.');
 if(/\blooking forward to (?:your thoughts|hearing|connecting)\b/i.test(text)) issues.push('Remove the canned closing; the branded signature is added once by the server.');
 if(/25\s*(?:%|percent)|\b(?:discount|coupon|promo code)\b/i.test(text)) issues.push('Do not repeat an unsolicited discount or code in a follow-up.');
 if(/24[- ]hour/i.test(text) && /next[- ]day/i.test(text)) issues.push('Do not repeat the complete production-and-shipping pitch in an unanswered follow-up.');
 if((text.match(/\?/g)||[]).length>1) issues.push('Use no more than one low-friction question.');
 if(text.trim().split(/\s+/).length>100) issues.push('Keep the follow-up under100 words, focused on one practical idea.');
 return issues;
}

export const FOLLOWUP_EDITORIAL_BRIEF = 'Write a fresh40–80word follow-up, not a check-in template. Use a neutral verified company-team greeting or omit the greeting. The first substantive sentence must introduce one practical signage application tied to the actual prior company context. Then ask at most one easy question about whether THAT specific idea would be useful. Do not ask about procurement, vendors, how orders are coordinated, or managing signage. Do not repeat the original speed/shipping pitch, any discount, a company biography, a sales closing, or a promise of samples/design work. Treat the use case as a suggestion, never a known planned purchase. Mention a real approved product naturally and cite only the business fact key actually used. Do not borrow company details from an example. A relevant hypothetical use can be an entrance message for a recurring event, a window-facing promotion for a restaurant campaign, or a location-specific seasonal notice, but choose the idea from THIS company\'s recorded context. Every assertion must remain supported and independent review is still required.';
