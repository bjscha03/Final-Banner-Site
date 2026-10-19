// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import IsolatedExpressWallet from './IsolatedExpressWallet';

const mocks = vi.hoisted(() => ({ groups: [] as any[], buttons: [] as any[] }));
vi.mock('@stripe/react-stripe-js', async () => {
  const React = await import('react');
  const context = React.createContext<any>(null);
  return {
    Elements: ({ children, options }: any) => {
      const group = React.useMemo(() => ({ submit: vi.fn(), options }), []);
      if (!mocks.groups.includes(group)) mocks.groups.push(group);
      return <context.Provider value={group}>{children}</context.Provider>;
    },
    useElements: () => React.useContext(context),
    ExpressCheckoutElement: (props: any) => { mocks.buttons.push(props); return null; },
  };
});

it('keeps each native wallet bound to its own Elements group through confirmation', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const confirm = vi.fn();
  await act(async () => root.render(<>
    <IsolatedExpressWallet stripe={null} amount={3392} options={{ paymentMethods: { applePay: 'always', googlePay: 'never' } }} onConfirm={confirm} />
    <IsolatedExpressWallet stripe={null} amount={3392} options={{ paymentMethods: { applePay: 'never', googlePay: 'always' } }} onConfirm={confirm} />
  </>));
  expect(mocks.groups).toHaveLength(2);
  expect(mocks.groups[0]).not.toBe(mocks.groups[1]);
  const apple = { expressPaymentType: 'apple_pay' };
  const google = { expressPaymentType: 'google_pay' };
  mocks.buttons[0].onConfirm(apple);
  mocks.buttons[1].onConfirm(google);
  expect(confirm).toHaveBeenNthCalledWith(1, apple, mocks.groups[0]);
  expect(confirm).toHaveBeenNthCalledWith(2, google, mocks.groups[1]);
  expect(mocks.groups.every(group => group.options.amount === 3392)).toBe(true);
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
