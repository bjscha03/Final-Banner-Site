import React from 'react';
const usd=(c:number)=>`$${(c/100).toFixed(2)}`;
export const AdminAIPriceSummary=({pricing,tax}:any)=><div className='border-t border-zinc-700 pt-3 text-sm space-y-2'><div className='flex justify-between'><span>Subtotal</span><span>{usd(pricing.subtotalBeforeDiscountCents||0)}</span></div><div className='flex justify-between'><span>Tax</span><span>{usd(tax||0)}</span></div><div className='flex justify-between font-bold text-[#f3c245]'><span>Total</span><span>{usd(pricing.totalAfterDiscountWithTaxCents||0)}</span></div></div>;
