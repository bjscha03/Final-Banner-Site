const normalizedPhone = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

export const isValidCheckoutPhone = (value: unknown): boolean => (
  normalizedPhone(value).replace(/\D/g, '').length >= 7
);

export const selectWalletCheckoutPhone = ({
  billingPhone,
  shippingPhone,
  fallbackPhone,
}: {
  billingPhone?: unknown;
  shippingPhone?: unknown;
  fallbackPhone?: unknown;
}): string => {
  const candidates = [billingPhone, shippingPhone, fallbackPhone].map(normalizedPhone);
  return candidates.find(isValidCheckoutPhone) || '';
};
