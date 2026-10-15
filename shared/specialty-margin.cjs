'use strict';
// Costs stay in the private authoring input. This calculator writes retail cents only.
function priceForMargin(landedCostCents, policy) {
  if (!Number.isInteger(landedCostCents) || landedCostCents < 0) throw new Error('Expected a nonnegative cost in cents.');
  const discount=policy.maximumDiscountPercent/100, feeRate=policy.estimatedProcessingPercent/100;
  const target=policy.targetContributionMarginPercent/100, fixed=policy.estimatedProcessingFixedCents;
  const denominator=(1-discount)*(1-feeRate-target);
  if (!(denominator>0)) throw new Error('The pricing target cannot be met.');
  const ideal=(landedCostCents+fixed)/denominator;
  let best;
  // Check adjacent cents because discount and processing each round separately.
  for(let list=Math.max(1,Math.floor(ideal)-8);list<=Math.ceil(ideal)+8;list++) {
    const paid=list-Math.round(list*discount), fees=Math.round(paid*feeRate)+fixed;
    const profit=paid-landedCostCents-fees, error=Math.abs(profit/paid-target);
    const candidate={listCents:list,paidCents:paid,feesCents:fees,profitCents:profit,margin:profit/paid,error,distance:Math.abs(list-ideal)};
    if(!best || error<best.error || (error===best.error && candidate.distance<best.distance)) best=candidate;
  }
  return best;
}
module.exports={priceForMargin};
