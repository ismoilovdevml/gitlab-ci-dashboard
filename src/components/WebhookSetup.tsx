'use client';

import { useState, useEffect } from 'react';
import { Webhook, Copy, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useDashboardStore } from '@/store/dashboard-store';

export default function WebhookSetup() {
  const { theme, card, textPrimary, textSecondary } = useTheme();
  const { addNotification } = useDashboardStore();
  const [copied, setCopied] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');

  useEffect(() => {
    // Get the webhook URL based on current host
    if (typeof window !== 'undefined') {
      const baseUrl = window.location.origin;
      setWebhookUrl(`${baseUrl}/api/webhook/gitlab`);
    }
  }, []);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      addNotification({
        id: Date.now().toString(),
        type: 'success',
        title: 'Copied!',
        message: 'Webhook URL copied to clipboard',
        timestamp: Date.now(),
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <div className={`${card} p-6 space-y-6`}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-orange-500/20 rounded-lg">
          <Webhook className="w-6 h-6 text-orange-500" />
        </div>
        <div>
          <h3 className={`text-lg font-semibold ${textPrimary}`}>GitLab Webhook Setup</h3>
          <p className={`text-sm ${textSecondary}`}>
            Real-time alerts using GitLab webhooks (instant notifications)
          </p>
        </div>
      </div>

      {/* Benefits */}
      <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-green-500/10 border border-green-500/20' : 'bg-green-50 border border-green-200'}`}>
        <div className="flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className={`font-medium ${textPrimary} mb-2`}>Why use webhooks?</p>
            <ul className={`text-sm ${textSecondary} space-y-1`}>
              <li>• ⚡ <strong>Instant alerts</strong> - No delay, get notified immediately</li>
              <li>• 🎯 <strong>Accurate</strong> - GitLab sends event directly to us</li>
              <li>• 🔋 <strong>Efficient</strong> - No polling, saves resources</li>
              <li>• 📊 <strong>Complete data</strong> - Full pipeline information</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Webhook URL */}
      <div className="space-y-3">
        <label className={`block font-medium ${textPrimary}`}>Your Webhook URL</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={webhookUrl}
            readOnly
            className={`flex-1 px-3 py-2 border rounded-lg font-mono text-sm ${
              theme === 'dark'
                ? 'bg-gray-800 border-gray-700 text-gray-300'
                : 'bg-gray-50 border-gray-300 text-gray-700'
            }`}
          />
          <button
            onClick={copyToClipboard}
            className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
              copied
                ? 'bg-green-500 text-white'
                : 'bg-orange-500 text-white hover:bg-orange-600'
            }`}
          >
            {copied ? (
              <>
                <CheckCircle className="w-4 h-4" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy
              </>
            )}
          </button>
        </div>
      </div>

      {/* Setup Instructions */}
      <div className="space-y-4">
        <h4 className={`font-medium ${textPrimary} flex items-center gap-2`}>
          📋 Setup Instructions
        </h4>

        <div className={`space-y-3 text-sm ${textSecondary}`}>
          <div className="flex gap-3">
            <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              theme === 'dark' ? 'bg-orange-500/20 text-orange-500' : 'bg-orange-100 text-orange-600'
            }`}>
              1
            </div>
            <div>
              <p className={textPrimary}>Go to your GitLab project</p>
              <p className="text-xs mt-1">Settings → Webhooks</p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              theme === 'dark' ? 'bg-orange-500/20 text-orange-500' : 'bg-orange-100 text-orange-600'
            }`}>
              2
            </div>
            <div>
              <p className={textPrimary}>Paste the webhook URL above</p>
              <p className="text-xs mt-1">In the &quot;URL&quot; field</p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              theme === 'dark' ? 'bg-orange-500/20 text-orange-500' : 'bg-orange-100 text-orange-600'
            }`}>
              3
            </div>
            <div>
              <p className={textPrimary}>Select &quot;Pipeline events&quot; trigger</p>
              <p className="text-xs mt-1">Check only &quot;Pipeline events&quot;</p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              theme === 'dark' ? 'bg-orange-500/20 text-orange-500' : 'bg-orange-100 text-orange-600'
            }`}>
              4
            </div>
            <div>
              <p className={textPrimary}>Click &quot;Add webhook&quot;</p>
              <p className="text-xs mt-1">Done! Test it by running a pipeline</p>
            </div>
          </div>
        </div>
      </div>

      {/* Warning about ngrok/tunnel */}
      {webhookUrl.includes('localhost') && (
        <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-yellow-50 border border-yellow-200'}`}>
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className={`font-medium ${textPrimary} mb-1`}>Local Development Notice</p>
              <p className={`text-sm ${textSecondary}`}>
                GitLab cannot reach <code>localhost</code>. For testing webhooks locally, you need to:
              </p>
              <ul className={`text-sm ${textSecondary} mt-2 space-y-1`}>
                <li>• Use <strong>ngrok</strong> or <strong>cloudflare tunnel</strong> to expose your local server</li>
                <li>• Or deploy to a public server (production/staging)</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Help Link */}
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
