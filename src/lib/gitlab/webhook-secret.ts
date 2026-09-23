import { createHmac } from 'crypto';

/**
 * Per-organization webhook secret, derived from GITLAB_WEBHOOK_SECRET so no
 * extra storage is needed. One org's secret does not reveal another's.
 */
export function deriveOrgWebhookSecret(globalSecret: string, organizationId: string): string {
  return createHmac('sha256', globalSecret)
    .update(`gitlab-webhook-org:${organizationId}`)
    .digest('hex');
}
