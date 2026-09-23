/**
 * @jest-environment node
 */
import { createHmac } from 'crypto';
import { deriveOrgWebhookSecret } from '@/lib/gitlab/webhook-secret';

describe('deriveOrgWebhookSecret', () => {
  it('is HMAC-SHA256(global, "gitlab-webhook-org:" + orgId) in hex', () => {
    const expected = createHmac('sha256', 'global')
      .update('gitlab-webhook-org:org-1')
      .digest('hex');

    expect(deriveOrgWebhookSecret('global', 'org-1')).toBe(expected);
    expect(expected).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs per organization and per global secret', () => {
    const base = deriveOrgWebhookSecret('global', 'org-1');

    expect(deriveOrgWebhookSecret('global', 'org-2')).not.toBe(base);
    expect(deriveOrgWebhookSecret('other', 'org-1')).not.toBe(base);
  });
});
