'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Webhook,
  Copy,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useDashboardStore } from '@/store/dashboard-store';

interface WebhookSetupData {
  url: string;
  secret: string;
  scope: 'organization' | 'global';
  organizationId: string | null;
  note?: string;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: WebhookSetupData }
  | { status: 'error'; message: string };

type CopyField = 'url' | 'secret';

const MASKED_SECRET = '•'.repeat(32);

async function loadWebhookSetup(): Promise<LoadState> {
  try {
    const res = await fetch('/api/webhook/setup', { cache: 'no-store' });
    if (res.ok) {
      return { status: 'ready', data: (await res.json()) as WebhookSetupData };
    }
    if (res.status === 403) {
      return {
        status: 'error',
        message: 'Only organization admins can view the webhook URL and secret. Ask an admin to set it up.',
      };
    }
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { status: 'error', message: body?.error || `Failed to load webhook settings (HTTP ${res.status})` };
  } catch {
    return { status: 'error', message: 'Failed to load webhook settings. Check your connection and try again.' };
  }
}

export default function WebhookSetup() {
  const { theme, card, textPrimary, textSecondary } = useTheme();
  const { addNotification } = useDashboardStore();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<CopyField | null>(null);

  useEffect(() => {
    let active = true;
    loadWebhookSetup().then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, []);

  const copy = useCallback(
    async (field: CopyField, value: string) => {
      const label = field === 'url' ? 'Webhook URL' : 'Secret token';
      try {
        await navigator.clipboard.writeText(value);
        setCopied(field);
        addNotification({
          id: Date.now().toString(),
          type: 'success',
          title: 'Copied!',
          message: `${label} copied to clipboard`,
          timestamp: Date.now(),
        });
        setTimeout(() => setCopied((current) => (current === field ? null : current)), 2000);
      } catch {
        addNotification({
          id: Date.now().toString(),
          type: 'error',
          title: 'Copy failed',
          message: `Could not copy the ${label.toLowerCase()}. Copy it manually.`,
          timestamp: Date.now(),
        });
      }
    },
    [addNotification]
  );

  const fieldClass = `flex-1 min-w-0 px-3 py-2 border rounded-lg font-mono text-sm ${
    theme === 'dark'
      ? 'bg-gray-800 border-gray-700 text-gray-300'
      : 'bg-gray-50 border-gray-300 text-gray-700'
  }`;
  const stepBadge = `shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
    theme === 'dark' ? 'bg-orange-500/20 text-orange-500' : 'bg-orange-100 text-orange-600'
  }`;

  const copyButton = (field: CopyField, value: string, label: string) => (
    <button
      type="button"
      onClick={() => copy(field, value)}
      aria-label={`Copy ${label}`}
      className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
        copied === field ? 'bg-green-500 text-white' : 'bg-orange-500 text-white hover:bg-orange-600'
      }`}
    >
      {copied === field ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      {copied === field ? 'Copied' : 'Copy'}
    </button>
  );

  const data = state.status === 'ready' ? state.data : null;
  const steps: Array<{ title: string; detail: string }> = [
    { title: 'Open your GitLab project or group', detail: 'Settings → Webhooks → Add new webhook' },
    { title: 'Paste the webhook URL', detail: 'Into the "URL" field' },
    { title: 'Paste the secret', detail: 'Into the "Secret token" field' },
    { title: 'Select triggers', detail: 'Enable "Pipeline events" and "Job events"' },
    { title: 'Save and test', detail: 'Click "Add webhook", then Test → Pipeline events' },
  ];

  return (
    <div className={`${card} p-6 space-y-6`}>
      <div className="flex items-center gap-3">
        <div className="p-2 bg-orange-500/20 rounded-lg">
          <Webhook className="w-6 h-6 text-orange-500" />
        </div>
        <div>
          <h3 className={`text-lg font-semibold ${textPrimary}`}>GitLab Webhook Setup</h3>
          <p className={`text-sm ${textSecondary}`}>
            Instant pipeline and job alerts pushed by GitLab, no polling
          </p>
        </div>
      </div>

      {state.status === 'loading' && (
        <div className={`flex items-center gap-2 text-sm ${textSecondary}`} role="status">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading webhook settings…
        </div>
      )}

      {state.status === 'error' && (
        <div
          role="alert"
          className={`p-4 rounded-lg flex items-start gap-3 ${
            theme === 'dark' ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-yellow-50 border border-yellow-200'
          }`}
        >
          <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5 shrink-0" />
          <p className={`text-sm ${textPrimary}`}>{state.message}</p>
        </div>
      )}

      {data && (
        <>
          {data.note && (
            <p className={`text-sm ${textSecondary}`} data-testid="webhook-scope-note">
              {data.note}
            </p>
          )}

          <div className="space-y-2">
            <label htmlFor="webhook-url" className={`block font-medium ${textPrimary}`}>
              Webhook URL
            </label>
            <div className="flex gap-2">
              <input id="webhook-url" type="text" value={data.url} readOnly className={fieldClass} />
              {copyButton('url', data.url, 'webhook URL')}
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="webhook-secret" className={`block font-medium ${textPrimary}`}>
              Secret token
            </label>
            <div className="flex gap-2">
              <input
                id="webhook-secret"
                type="text"
                value={revealed ? data.secret : MASKED_SECRET}
                readOnly
                autoComplete="off"
                spellCheck={false}
                className={fieldClass}
              />
              <button
                type="button"
                onClick={() => setRevealed((r) => !r)}
                aria-label={revealed ? 'Hide secret' : 'Reveal secret'}
                aria-pressed={revealed}
                className={`px-3 py-2 rounded-lg border transition-colors ${
                  theme === 'dark'
                    ? 'border-gray-700 text-gray-300 hover:bg-gray-800'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                }`}
              >
                {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              {copyButton('secret', data.secret, 'secret token')}
            </div>
            <p className={`text-xs ${textSecondary}`}>
              Treat this like a password. GitLab sends it in the X-Gitlab-Token header.
            </p>
          </div>

          <div className="space-y-4">
            <h4 className={`font-medium ${textPrimary}`}>Setup steps</h4>
            <ol className={`space-y-3 text-sm ${textSecondary}`}>
              {steps.map((step, i) => (
                <li key={step.title} className="flex gap-3">
                  <div className={stepBadge}>{i + 1}</div>
                  <div>
                    <p className={textPrimary}>{step.title}</p>
                    <p className="text-xs mt-1">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/localhost|127\.0\.0\.1/.test(data.url) && (
            <div
              className={`p-4 rounded-lg ${
                theme === 'dark' ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-yellow-50 border border-yellow-200'
              }`}
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5 shrink-0" />
                <div>
                  <p className={`font-medium ${textPrimary} mb-1`}>Local development</p>
                  <p className={`text-sm ${textSecondary}`}>
                    GitLab cannot reach <code>localhost</code>. Expose the dashboard with a tunnel
                    (ngrok, Cloudflare Tunnel) or use a publicly reachable deployment.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <div className="pt-4 border-t border-gray-700">
        <a
          href="https://docs.gitlab.com/ee/user/project/integrations/webhooks.html"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-orange-500 hover:text-orange-400 flex items-center gap-2"
        >
          <ExternalLink className="w-4 h-4" />
          GitLab Webhook Documentation
        </a>
      </div>
    </div>
  );
}
