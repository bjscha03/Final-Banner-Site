import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/save-cart-snapshot.cjs';

const lambdaHandler = withLambda(legacyModule.handler);
const RECOVERY_BACKGROUND_PATH = '/.netlify/functions/detect-abandoned-carts-background';
const DISPATCH_TIMEOUT_MS = 10_000;

function immutableDeployOrigin(context) {
  const deployId = String(context?.deploy?.id || '').trim().toLowerCase();
  const siteName = String(context?.site?.name || '').trim().toLowerCase();
  const dnsLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  if (!dnsLabel.test(deployId) || !dnsLabel.test(siteName)) return null;
  return `https://${deployId}--${siteName}.netlify.app`;
}

async function dispatchImmediateRecovery({ cartId, context, fetchImpl = fetch, env = process.env } = {}) {
  const origin = immutableDeployOrigin(context);
  const secret = String(env.INTERNAL_JOB_SECRET || '');
  const normalizedCartId = String(cartId || '').trim().toLowerCase();
  const cartIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  if (!origin || !secret || !cartIdPattern.test(normalizedCartId)) {
    throw new Error('RECOVERY_DISPATCH_CONFIGURATION_MISSING');
  }
  const response = await fetchImpl(`${origin}${RECOVERY_BACKGROUND_PATH}`, {
    method: 'POST',
    redirect: 'error',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Job-Secret': secret,
    },
    body: JSON.stringify({ trigger: 'pagehide', cartId: normalizedCartId }),
    signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
  });
  if (response.status !== 202) throw new Error(`RECOVERY_BACKGROUND_DISPATCH_${response.status}`);
}

async function isAbandonmentSignal(request) {
  if (request.method !== 'POST') return false;
  try {
    const body = await request.clone().json();
    return body?.captureKind === 'lifecycle' && body?.abandonmentSignal === true;
  } catch {
    return false;
  }
}

function createHandler({
  handleLambda = lambdaHandler,
  dispatch = dispatchImmediateRecovery,
  logger = console,
} = {}) {
  return async function saveSnapshotHandler(request, context) {
    const shouldDispatch = await isAbandonmentSignal(request);
    const response = await handleLambda(request, context);
    if (!shouldDispatch || !response.ok) return response;

    let acceptedCartId = null;
    try {
      const body = await response.clone().json();
      acceptedCartId = body?.success === true
        && body?.status === 'active'
        && body?.abandonmentAccepted === true
        && typeof body?.cartId === 'string'
        ? body.cartId
        : null;
    } catch {
      acceptedCartId = null;
    }
    if (!acceptedCartId) return response;

    // Pagehide is a best-effort browser signal. Queue this accepted cart's
    // guarded sequence-one attempt immediately; the global one-minute scan is
    // retained as the fallback for browsers or internal dispatches that fail.
    try {
      await dispatch({ cartId: acceptedCartId, context });
    } catch (error) {
      logger.warn('[save-cart-snapshot] immediate recovery dispatch deferred to schedule', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return response;
  };
}

const handler = createHandler();
export default handler;

export const _test = {
  DISPATCH_TIMEOUT_MS,
  RECOVERY_BACKGROUND_PATH,
  createHandler,
  dispatchImmediateRecovery,
  handler,
  immutableDeployOrigin,
  isAbandonmentSignal,
};
