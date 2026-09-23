import { NextRequest, NextResponse } from 'next/server';
import { getOrgPrisma } from '@/lib/db/scoped-prisma';
import { requireCsrf } from '@/lib/csrf';
import { createLogger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';
import { ChannelConfigError, isDeliverableChannelType, sendChannelAlert } from '@/lib/notifications';

const log = createLogger('ChannelTest');

const TESTS_PER_MINUTE = 5;

// POST /api/channels/test { type } - Send a test alert through the organization's saved channel.
// The browser only names the channel; the config (and its secrets) is read on the server.
export async function POST(request: NextRequest) {
  const csrfError = requireCsrf(request);
  if (csrfError) return csrfError;

  const { db, auth } = await getOrgPrisma();
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  const type = body !== null && typeof body === 'object' ? (body as { type?: unknown }).type : undefined;
  if (!isDeliverableChannelType(type)) {
    return NextResponse.json(
      { error: 'Test messages can be sent to telegram, slack and discord channels' },
      { status: 400 }
    );
  }

  const limit = await rateLimit(`channel-test:${auth.user.id}`, { limit: TESTS_PER_MINUTE, window: 60 });
  if (!limit.success) {
    return NextResponse.json({ error: 'Too many test messages; try again in a minute' }, { status: 429 });
  }

  try {
    const channel = await db.alertChannel.findFirst({ where: { type } });
    if (!channel) {
      return NextResponse.json({ error: 'Save the channel configuration first' }, { status: 404 });
    }

    await sendChannelAlert(type, channel.config, {
      title: 'Test notification',
      message: 'Alerts from GitLab CI/CD Dashboard are configured for this channel.',
      url: request.nextUrl.origin,
      status: 'success',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ChannelConfigError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    log.warn('Test alert failed', { channel: type, error });
    // Sender errors carry the upstream status or Telegram's description, never the config.
    const reason = error instanceof Error ? `: ${error.message}` : '';
    return NextResponse.json(
      { error: `Could not deliver the test message to ${type}${reason}` },
      { status: 502 }
    );
  }
}
