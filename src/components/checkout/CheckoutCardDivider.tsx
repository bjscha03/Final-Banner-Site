import React from 'react';

const cardBrands = [
  ['visa', 'Visa'],
  ['mastercard', 'Mastercard'],
  ['amex', 'American Express'],
  ['discover', 'Discover'],
] as const;

export function CheckoutCardDivider() {
  return (
    <div className="checkout-card-alternative">
      <div className="checkout-payment-divider">
        <span aria-hidden="true" />
        <p>or pay by card</p>
        <span aria-hidden="true" />
      </div>
      <div className="checkout-accepted-cards" role="group" aria-label="Accepted cards">
        {cardBrands.map(([file, label]) => (
          <img key={file} src={`/images/payment/${file}.svg`} alt={label} width="47" height="30" />
        ))}
      </div>
    </div>
  );
}
