'use strict';

const { assertProviderAdapter } = require('./contract.cjs');
const { createApolloAdapter } = require('./apollo.cjs');

// Provider-specific modules are registered here and nowhere in the core sales
// engine. Adding a licensed source requires one adapter plus one registry entry;
// discovery, qualification, budgeting, jobs, and admin APIs remain unchanged.
const DISCOVERY_ADAPTER_FACTORIES = Object.freeze({
  apollo: createApolloAdapter,
});

function providerFactory(providerId, factories = DISCOVERY_ADAPTER_FACTORIES) {
  const id = String(providerId || '').trim().toLowerCase();
  return typeof factories?.[id] === 'function' ? factories[id] : null;
}

function hasDiscoveryAdapter(providerId, factories = DISCOVERY_ADAPTER_FACTORIES) {
  return Boolean(providerFactory(providerId, factories));
}

function createDiscoveryAdapter(providerId, options = {}, factories = DISCOVERY_ADAPTER_FACTORIES) {
  const factory = providerFactory(providerId, factories);
  if (!factory) {
    const error = new Error('The requested licensed discovery adapter is not installed.');
    error.code = 'PROVIDER_ADAPTER_NOT_INSTALLED';
    throw error;
  }
  const adapter = assertProviderAdapter(factory(options));
  if (adapter.kind !== 'discovery' || adapter.id !== String(providerId).trim().toLowerCase()) {
    const error = new Error('The discovery adapter identity does not match its registry entry.');
    error.code = 'PROVIDER_ADAPTER_ID_MISMATCH';
    throw error;
  }
  return adapter;
}

function enabledDiscoveryProviderConfigs(providerConfigs = [], factories = DISCOVERY_ADAPTER_FACTORIES) {
  return providerConfigs
    .filter((provider) => provider?.enabled === true && hasDiscoveryAdapter(provider.id, factories))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

module.exports = {
  DISCOVERY_ADAPTER_FACTORIES,
  providerFactory,
  hasDiscoveryAdapter,
  createDiscoveryAdapter,
  enabledDiscoveryProviderConfigs,
};
