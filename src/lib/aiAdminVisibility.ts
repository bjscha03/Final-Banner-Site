import { ENABLE_AI } from './featureFlags';
import { getServerSessionToken } from './serverAuth';

type AdminIdentity = {
  is_admin?: boolean;
} | null | undefined;

export type AIAdminVisibilityInput = {
  featureEnabled: boolean;
  isAdminUser: boolean;
  hasSignedSession: boolean;
  authenticationFailed: boolean;
};

/**
 * Entry-point visibility is an authorization decision, not a provider
 * readiness decision. OpenAI/model/storage readiness is shown inside the
 * workspace and only disables provider actions there.
 */
export function shouldShowAIAdminEntry(input: AIAdminVisibilityInput): boolean {
  return input.featureEnabled
    && input.isAdminUser
    && input.hasSignedSession
    && !input.authenticationFailed;
}

export function canUseAIAdminPreview(
  user: AdminIdentity,
  authenticationFailed = false,
): boolean {
  return shouldShowAIAdminEntry({
    featureEnabled: ENABLE_AI,
    isAdminUser: user?.is_admin === true,
    hasSignedSession: Boolean(getServerSessionToken()),
    authenticationFailed,
  });
}
