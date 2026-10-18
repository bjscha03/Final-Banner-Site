import type { Config } from '@netlify/functions';

type Component = { types?: string[]; longText?: string; shortText?: string };

export function parseAddress(components: Component[] = []) {
  const part = (type: string, short = false) => {
    const component = components.find(item => item.types?.includes(type));
    return (short ? component?.shortText : component?.longText) || '';
  };
  const zip = part('postal_code');
  const suffix = part('postal_code_suffix');
  return {
    street: [part('street_number'), part('route')].filter(Boolean).join(' '),
    street2: part('subpremise'),
    city: part('locality') || part('postal_town') || part('sublocality_level_1') || part('administrative_area_level_3'),
    state: part('administrative_area_level_1', true),
    zip: zip && suffix ? `${zip}-${suffix}` : zip,
    country: part('country', true),
    hasStreetNumber: Boolean(part('street_number')),
  };
}

const json = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});

export function validationResult(result: any) {
  const verdict = result?.verdict || {};
  const postal = result?.address?.postalAddress;
  const dpv = result?.uspsData?.dpvConfirmation;
  const missingUnit = dpv === 'D' || result?.address?.missingComponentTypes?.includes('subpremise');
  const valid = verdict.addressComplete === true
    && ['PREMISE', 'SUB_PREMISE'].includes(verdict.validationGranularity)
    && !verdict.hasUnconfirmedComponents && !verdict.hasReplacedComponents
    && !['D', 'S', 'N'].includes(dpv);
  const suggested = postal?.regionCode === 'US' && postal.addressLines?.[0] && postal.locality && postal.administrativeArea && postal.postalCode
    ? { street: postal.addressLines[0], street2: postal.addressLines.slice(1).join(', '), city: postal.locality,
      state: postal.administrativeArea, zip: postal.postalCode, country: 'US' } : null;
  return { valid, suggested, message: missingUnit
    ? 'This address may need an apartment or suite number. Please add it before continuing.'
    : dpv === 'S' ? 'The apartment or suite could not be confirmed. Please check it.'
    : 'Please review your delivery address. We found a possible correction or could not confirm all its details.' };
}

export default async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  // Never expose the Google key or allow another website to spend our quota.
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) return json({ error: 'ORIGIN_REJECTED' }, 403);
  if (!request.headers.get('content-type')?.includes('application/json')) return json({ error: 'INVALID_REQUEST' }, 400);
  const raw = await request.text();
  if (raw.length > 2048) return json({ error: 'INVALID_REQUEST' }, 400);
  let input;
  try { input = JSON.parse(raw); } catch { return json({ error: 'INVALID_REQUEST' }, 400); }
  const { action, query, placeId, sessionToken, address } = input || {};
  if (typeof sessionToken !== 'string' || !/^[a-zA-Z0-9_-]{16,36}$/.test(sessionToken)) {
    return json({ error: 'INVALID_SESSION' }, 400);
  }
  if (!['suggest', 'details', 'validate'].includes(action)) return json({ error: 'INVALID_ACTION' }, 400);
  if (action === 'validate' && (!address || address.country !== 'US'
    || !['street', 'city', 'state', 'zip'].every(field => typeof address[field] === 'string' && address[field].trim() && address[field].length <= 200)
    || (address.street2 !== undefined && (typeof address.street2 !== 'string' || address.street2.length > 200)))) {
    return json({ error: 'INVALID_ADDRESS' }, 400);
  }
  if (action === 'suggest' && (typeof query !== 'string' || query.trim().length < 4 || query.length > 200)) {
    return json({ error: 'INVALID_QUERY' }, 400);
  }
  if (action === 'details' && (typeof placeId !== 'string' || !/^[a-zA-Z0-9_-]{1,300}$/.test(placeId))) {
    return json({ error: 'INVALID_PLACE' }, 400);
  }
  const key = Netlify.env.get('CHECKOUT_GOOGLE_PLACES_API_KEY');
  if (!key) return json({ error: 'LOOKUP_UNAVAILABLE' }, 503);
  try {
    const headers = { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key };
    if (action === 'validate') {
      const response = await fetch('https://addressvalidation.googleapis.com/v1:validateAddress', {
        method: 'POST', headers, signal: AbortSignal.timeout(5000),
        body: JSON.stringify({ address: { regionCode: 'US', addressLines: [address.street, address.street2].filter(Boolean),
          locality: address.city, administrativeArea: address.state, postalCode: address.zip }, enableUspsCass: true }),
      });
      if (!response.ok) return json({ error: 'LOOKUP_UNAVAILABLE' }, 503);
      const data = await response.json();
      return json(validationResult(data.result));
    }
    const result = action === 'suggest'
      ? await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST', headers: { ...headers, 'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text' },
        body: JSON.stringify({ input: query.trim(), includedRegionCodes: ['us'], languageCode: 'en', sessionToken }),
        signal: AbortSignal.timeout(5000),
      })
      : await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}&languageCode=en`, {
        headers: { ...headers, 'X-Goog-FieldMask': 'addressComponents' }, signal: AbortSignal.timeout(5000),
      });
    if (!result.ok) return json({ error: 'LOOKUP_UNAVAILABLE' }, 503);
    const data = await result.json();
    if (action === 'suggest') {
      return json({ suggestions: (data.suggestions || []).flatMap((item: any) => {
        const prediction = item.placePrediction;
        return prediction?.placeId && prediction?.text?.text
          ? [{ id: prediction.placeId, label: prediction.text.text }] : [];
      }).slice(0, 5) });
    }
    const address = parseAddress(data.addressComponents);
    // A city, street, or business without a house number is not a full delivery address.
    if (address.country !== 'US' || !address.hasStreetNumber || !address.city || !address.state || !address.zip) {
      return json({ error: 'INCOMPLETE_ADDRESS' }, 422);
    }
    return json({ address });
  } catch {
    // Do not log customer addresses, provider responses, or credentials.
    return json({ error: 'LOOKUP_UNAVAILABLE' }, 503);
  }
};

export const config: Config = {
  rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowSize: 60, windowLimit: 60 },
};
