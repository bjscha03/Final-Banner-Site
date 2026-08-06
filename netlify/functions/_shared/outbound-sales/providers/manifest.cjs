'use strict';

// Adding a future provider means adding an adapter module and one manifest
// entry; the queue, prospect schema, qualification, and admin APIs stay the same.
const PROVIDER_MANIFEST = Object.freeze([
  Object.freeze({ id: 'google_places', displayName: 'Google Places', kind: 'discovery', acquisitionMode: 'licensed_api', secretEnvName: 'OUTBOUND_GOOGLE_PLACES_API_KEY', adapterInstalled: false }),
  Object.freeze({ id: 'apollo', displayName: 'Apollo Organization Search', kind: 'discovery', acquisitionMode: 'licensed_api', secretEnvName: 'OUTBOUND_APOLLO_API_KEY', adapterInstalled: true, executionScope: 'test_staging_only' }),
  Object.freeze({ id: 'clay', displayName: 'Clay', kind: 'discovery', acquisitionMode: 'licensed_api', secretEnvName: 'OUTBOUND_CLAY_API_KEY', adapterInstalled: false }),
  Object.freeze({ id: 'data_axle', displayName: 'Data Axle', kind: 'discovery', acquisitionMode: 'licensed_api', secretEnvName: 'OUTBOUND_DATA_AXLE_API_KEY', adapterInstalled: false }),
  Object.freeze({ id: 'yelp', displayName: 'Yelp / licensed provider', kind: 'discovery', acquisitionMode: 'licensed_api', secretEnvName: 'OUTBOUND_YELP_API_KEY', adapterInstalled: false }),
  Object.freeze({ id: 'email_verification', displayName: 'Email verification provider', kind: 'email_verification', acquisitionMode: 'licensed_api', secretEnvName: 'OUTBOUND_EMAIL_VERIFICATION_API_KEY', adapterInstalled: false }),
]);

function getProviderConfigurationStatus(env = process.env, manifest = PROVIDER_MANIFEST) {
  return manifest.map((provider) => ({
    id: provider.id,
    displayName: provider.displayName,
    kind: provider.kind,
    acquisitionMode: provider.acquisitionMode,
    configured: typeof env[provider.secretEnvName] === 'string' && env[provider.secretEnvName].trim().length > 0,
    adapterInstalled: provider.adapterInstalled === true,
    executionScope: provider.executionScope || 'not_installed',
    executionAllowed: provider.executionScope === 'test_staging_only'
      && ['test', 'dev', 'deploy-preview', 'branch-deploy'].includes(String(env.CONTEXT || (env.NODE_ENV === 'test' ? 'test' : '')).toLowerCase())
      && (env.NODE_ENV === 'test' || env.OUTBOUND_PHASE2_SHADOW_EXECUTION_ENABLED === 'true'),
    enabled: false,
  }));
}

module.exports = { PROVIDER_MANIFEST, getProviderConfigurationStatus };
