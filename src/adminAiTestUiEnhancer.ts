const AI_TEST_PATH = '/admin/customers';

const exactReplacements = new Map<string, string>([
  ['September deal', 'AI designer test'],
  ['Send Sept Deal', 'Send AI Test'],
  ['Retry Sept Deal', 'Retry AI Test'],
  ['Sept Deal Sent', 'AI Test Sent'],
  ['Send September 25% promotion?', 'Send AI Designer test email?'],
  [
    'Confirming will immediately send the finished September large-banner promotion through the live email system.',
    'Confirming will immediately send the branded AI Designer test email through the live email system.',
  ],
  [
    'Offer: 25% off banners 6′ × 3′ or larger with code BIG25, valid through September 8.',
    'Offer: a unique one-time 30% off code for this past customer, plus an additional 20% off future order after they submit AI Designer feedback.',
  ],
  ['Send Sept Deal Now', 'Send AI Test Now'],
  ['September deal sent', 'AI test email sent'],
  ['September deal already sent', 'AI test email already sent'],
  ['September deal not sent', 'AI test email not sent'],
]);

const partialReplacements: Array<[string, string]> = [
  ['received the 25% large-banner promotion.', 'received the AI Designer test offer with a unique 30% code.'],
  ['The September deal email could not be sent.', 'The AI Designer test email could not be sent.'],
];

function rewriteTextNode(node: Text) {
  const current = node.nodeValue || '';
  const trimmed = current.trim();
  const exact = exactReplacements.get(trimmed);
  if (exact) {
    const leading = current.slice(0, current.indexOf(trimmed));
    const trailing = current.slice(current.indexOf(trimmed) + trimmed.length);
    node.nodeValue = `${leading}${exact}${trailing}`;
    return;
  }

  let next = current;
  for (const [from, to] of partialReplacements) next = next.replace(from, to);
  if (next !== current) node.nodeValue = next;
}

function rewriteAiTestLabels(root: ParentNode = document) {
  if (window.location.pathname !== AI_TEST_PATH) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    rewriteTextNode(node as Text);
    node = walker.nextNode();
  }
}

export function installAdminAiTestUiEnhancer() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const run = () => rewriteAiTestLabels(document);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }

  const observer = new MutationObserver((mutations) => {
    if (window.location.pathname !== AI_TEST_PATH) return;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.TEXT_NODE) rewriteTextNode(node as Text);
        else if (node.nodeType === Node.ELEMENT_NODE) rewriteAiTestLabels(node as Element);
      }
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
}

installAdminAiTestUiEnhancer();
