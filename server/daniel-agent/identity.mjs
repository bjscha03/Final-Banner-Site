export const BUSINESS_ADDRESS = 'PO Box 368, Crestwood, KY 40014';
export const BOF_SENDER = 'info@bannersonthefly.com';
export const REPORT_RECIPIENT = 'brandon.schaefer@hotmail.com';
export async function verifySender(token, request) {
  const aliases = await request(token, '/settings/sendAs');
  if (!aliases.sendAs?.some(x => x.sendAsEmail?.toLowerCase() === BOF_SENDER && x.verificationStatus === 'accepted'))
    throw Error('Verified BOF sender identity unavailable');
}
