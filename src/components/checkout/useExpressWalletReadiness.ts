import { useEffect, useState } from 'react';

type Wallet = 'applePay' | 'googlePay';

/** Each independently mounted wallet must finish discovery before revealing the row. */
export function useExpressWalletReadiness() {
  const [availability, setAvailability] = useState({ applePay: false, googlePay: false });
  const [settled, setSettled] = useState({ applePay: false, googlePay: false });
  const [timedOut, setTimedOut] = useState(false);
  const ready = timedOut || (settled.applePay && settled.googlePay);

  useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(() => setTimedOut(true), 8000);
    return () => window.clearTimeout(timer);
  }, [ready]);

  const report = (wallet: Wallet, available: boolean) => {
    setAvailability(previous => previous[wallet] === available ? previous : { ...previous, [wallet]: available });
    setSettled(previous => previous[wallet] ? previous : { ...previous, [wallet]: true });
  };

  return { availability, ready, report };
}
