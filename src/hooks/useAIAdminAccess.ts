import { useEffect, useState } from 'react';
import { ENABLE_AI } from '@/lib/featureFlags';
import { authorizedHeaders } from '@/lib/serverAuth';

export type AIAdminStatus = {
  loading: boolean;
  authorized: boolean;
  authenticationFailed: boolean;
  enabled: boolean;
  keyConfigured: boolean;
  temporaryStorageConfigured: boolean;
  model: string | null;
  modelSnapshot: string | null;
  validationModel: string | null;
  modelAvailable: boolean;
  ready: boolean;
  blocker: string | null;
};

const CLOSED: AIAdminStatus = {
  loading: false,
  authorized: false,
  authenticationFailed: false,
  enabled: false,
  keyConfigured: false,
  temporaryStorageConfigured: false,
  model: null,
  modelSnapshot: null,
  validationModel: null,
  modelAvailable: false,
  ready: false,
  blocker: 'AI_NOT_ENABLED',
};

export function useAIAdminAccess(active = true) {
  const [status, setStatus] = useState<AIAdminStatus>(() => (
    ENABLE_AI && active ? { ...CLOSED, loading: true, enabled: true, blocker: null } : CLOSED
  ));

  useEffect(() => {
    if (!ENABLE_AI || !active) {
      setStatus(CLOSED);
      return;
    }
    const controller = new AbortController();
    setStatus((current) => ({ ...current, loading: true }));
    fetch('/.netlify/functions/ai-designer-status', {
      method: 'GET',
      headers: authorizedHeaders({ Accept: 'application/json' }),
      signal: controller.signal,
      credentials: 'same-origin',
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          const authenticationFailed = response.status === 401;
          setStatus({
            ...CLOSED,
            loading: false,
            authenticationFailed,
            blocker: authenticationFailed ? 'ADMIN_SESSION_REQUIRED' : body?.error || 'STATUS_UNAVAILABLE',
          });
          return;
        }
        setStatus({
          loading: false,
          authorized: body.authorized === true,
          authenticationFailed: false,
          enabled: body.enabled === true,
          keyConfigured: body.keyConfigured === true,
          temporaryStorageConfigured: body.temporaryStorageConfigured === true,
          model: body.model || null,
          modelSnapshot: body.modelSnapshot || null,
          validationModel: body.validationModel || null,
          modelAvailable: body.modelAvailable === true,
          ready: body.ready === true,
          blocker: body.blocker || null,
        });
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') setStatus({
          ...CLOSED,
          loading: false,
          authenticationFailed: false,
          blocker: 'STATUS_UNAVAILABLE',
        });
      });
    return () => controller.abort();
  }, [active]);

  return status;
}
