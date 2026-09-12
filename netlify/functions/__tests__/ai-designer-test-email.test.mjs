import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AI_DESIGNER_TEST_SUBJECT,
  buildAiDesignerTestEmail,
} from '../../../src/lib/marketing/aiDesignerTestEmail.mjs';

const root = fileURLToPath(new URL('../../..', import.meta.url));

describe('AI Designer past-customer test email', () => {
  const email = buildAiDesignerTestEmail({
    customerName: 'Jamie Customer',
    discountCode: 'AI30-ABC12345',
    unsubscribeUrl: 'https://bannersonthefly.com/.netlify/functions/marketing-email-unsubscribe?token=p1.test',
    physicalAddress: 'PO Box 369, Crestwood, KY 40014',
    siteUrl: 'https://bannersonthefly.com',
  });

  it('contains the approved customer test offer and AI Designer CTA', () => {
    expect(email.subject).toBe(AI_DESIGNER_TEST_SUBJECT);
    expect(email.html).toContain('AI Banner Designer');
    expect(email.html).toContain('30% OFF');
    expect(email.html).toContain('AI30-ABC12345');
    expect(email.html).toContain('additional 20% off code');
    expect(email.html).toContain('https://bannersonthefly.com/designer');
    expect(email.text).toContain('AI30-ABC12345');
    expect(email.text).toContain('additional 20% off code');
  });

  it('ships and references the approved construction prompt-to-print promo image', () => {
    expect(existsSync(`${root}/public/images/ai-banner-designer-promo-email.jpg`)).toBe(true);
    expect(email.html).toContain('/images/ai-banner-designer-promo-email.jpg');
    expect(email.html).toContain('from prompt to printed vinyl banner');
  });

  it('includes the physical address and unsubscribe link', () => {
    expect(email.html).toContain('PO Box 369, Crestwood, KY 40014');
    expect(email.html).toContain('Unsubscribe from promotional emails');
    expect(email.text).toContain('Unsubscribe:');
  });
});
