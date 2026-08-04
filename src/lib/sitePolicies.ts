export const SITE_POLICIES = {
  preview: {
    short: 'Live on-screen preview before checkout',
    detail:
      'Standard online orders do not include a separate digital proof. Review the full on-screen print preview, spelling, dimensions, and placement before placing the order.',
  },
  production: {
    short: 'Most standard orders are produced within 24 hours',
    detail:
      'Production time and carrier transit time are separate. Most standard orders are produced within 24 hours. Large, custom, or file-dependent jobs can require additional time, and weekends or holidays can change the schedule.',
  },
  shipping: {
    short: 'Free next-day air on standard orders after production',
    detail:
      'Free next-day air describes carrier transit after production is complete. Delivery dates are estimates, and destination, carrier, weekend, holiday, quantity, or custom-job restrictions can apply.',
  },
  returns: {
    short: 'Custom products are final sale',
    detail:
      'Custom products cannot be returned. Report verified damage or a production defect within five business days of receipt with the order number and photos. Eligible claims are resolved with a reprint rather than a refund.',
  },
  cancellations: {
    short: 'Orders move into production quickly',
    detail:
      'Review the order carefully before payment. Once a final order is submitted, it cannot be cancelled or modified because production can begin immediately.',
  },
  artwork: {
    short: 'PDF, JPG, or PNG artwork up to 50 MB',
    detail:
      'Upload a print-ready PDF, JPG, or PNG up to 50 MB. Use high-resolution artwork, embed fonts in PDFs, and review the on-screen preview for cropping and placement before checkout.',
  },
} as const;

export const GLOBAL_FAQS = [
  {
    question: 'What file formats do you accept?',
    answer: SITE_POLICIES.artwork.detail,
    category: 'Artwork',
  },
  {
    question: 'What is your production time?',
    answer: SITE_POLICIES.production.detail,
    category: 'Production',
  },
  {
    question: 'Do you provide a digital proof?',
    answer: SITE_POLICIES.preview.detail,
    category: 'Artwork',
  },
  {
    question: 'How does free next-day air shipping work?',
    answer: SITE_POLICIES.shipping.detail,
    category: 'Shipping',
  },
  {
    question: 'What is your return policy?',
    answer: SITE_POLICIES.returns.detail,
    category: 'Policy',
  },
  {
    question: 'Can I cancel or modify an order?',
    answer: SITE_POLICIES.cancellations.detail,
    category: 'Orders',
  },
] as const;
