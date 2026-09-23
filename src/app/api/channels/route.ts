import { NextRequest, NextResponse } from 'next/server';
import { getOrgPrisma } from '@/lib/db/scoped-prisma';
import { cacheHelpers } from '@/lib/db/redis';
import { requireCsrf } from '@/lib/csrf';
import { createLogger, logSecurityEvent } from '@/lib/logger';
import { alertChannelSaveSchema, alertChannelTypeSchema } from '@/lib/validation';
import { buildChannelConfig, ChannelSaveError, toMaskedChannel, type MaskedChannel } from '@/lib/notifications';
import { canManageAlertChannels } from '@/lib/notifications/access';
import type { AuthContext } from '@/lib/auth/types';
import type { Prisma } from '@prisma/client';

const log = createLogger('Channels');

const NO_STORE = { 'Cache-Control': 'no-store' };

// Channel configs are per organization; a shared key would serve one org's channels to another.
// Only masked configs are cached, so secrets never reach Redis through this route.
function channelsCacheKey(organizationId: string | null): string {
  return `alert:channels:masked:${organizationId ?? 'default'}`;
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

async function forbidUnlessManager(auth: AuthContext, action: string): Promise<NextResponse | null> {
  if (await canManageAlertChannels(auth)) return null;
  logSecurityEvent(`Alert channel ${action} by non-admin`, {
    userId: auth.user.id,
    organizationId: auth.organizationId,
  });
  return json({ error: 'Forbidden - organization admin role required' }, 403);
}

// GET /api/channels - Alert channels with secrets masked, and whether the caller may change them
export async function GET() {
  try {
    const { db, auth } = await getOrgPrisma();
    if (!auth) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const [channels, canManage] = await Promise.all([
      cacheHelpers.getOrSet<MaskedChannel[]>(
        channelsCacheKey(auth.organizationId),
        async () => {
          const rows = await db.alertChannel.findMany({ orderBy: { updatedAt: 'desc' } });
          return rows.map(toMaskedChannel);
        },
        60
      ),
      canManageAlertChannels(auth),
    ]);

    return json({ channels, canManage });
  } catch (error) {
    log.error('Failed to fetch channels', { error });
    return json({ error: 'Failed to fetch channels' }, 500);
  }
}

// POST /api/channels - Create or update a channel. Masked or blank secrets keep the stored value.
export async function POST(request: NextRequest) {
  try {
    const csrfError = requireCsrf(request);
    if (csrfError) return csrfError;

    const { db, auth } = await getOrgPrisma();
    if (!auth) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const forbidden = await forbidUnlessManager(auth, 'change');
    if (forbidden) return forbidden;

    const body: unknown = await request.json().catch(() => null);
    const parsed = alertChannelSaveSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: 'Invalid request: type and config are required' }, 400);
    }
    const { type, config: submitted } = parsed.data;

    const existing = await db.alertChannel.findFirst({ where: { type } });

    let saved: { enabled: boolean; config: Record<string, unknown> };
    try {
      saved = buildChannelConfig(
        type,
        parsed.data.enabled ?? existing?.enabled ?? false,
        submitted,
        existing?.config ?? null
      );
    } catch (error) {
      if (error instanceof ChannelSaveError) {
        return json({ error: error.message }, 400);
      }
      throw error;
    }

    const channel = existing
      ? await db.alertChannel.update({
          where: { id: existing.id },
          data: { enabled: saved.enabled, config: saved.config as Prisma.InputJsonObject },
        })
      : await db.alertChannel.create({
          data: { type, enabled: saved.enabled, config: saved.config as Prisma.InputJsonObject },
        });

    await cacheHelpers.invalidate(channelsCacheKey(auth.organizationId));

    return json(toMaskedChannel(channel));
  } catch (error) {
    log.error('Failed to save channel', { error });
    return json({ error: 'Failed to save channel' }, 500);
  }
}

// DELETE /api/channels?type=telegram
export async function DELETE(request: NextRequest) {
  try {
    const csrfError = requireCsrf(request);
    if (csrfError) return csrfError;

    const { db, auth } = await getOrgPrisma();
    if (!auth) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const forbidden = await forbidUnlessManager(auth, 'delete');
    if (forbidden) return forbidden;

    const type = alertChannelTypeSchema.safeParse(request.nextUrl.searchParams.get('type'));
    if (!type.success) {
      return json({ error: 'Missing or unknown channel type' }, 400);
    }

    const channel = await db.alertChannel.findFirst({ where: { type: type.data } });
    if (channel) {
      await db.alertChannel.delete({ where: { id: channel.id } });
    }

    await cacheHelpers.invalidate(channelsCacheKey(auth.organizationId));

    return json({ success: true });
  } catch (error) {
    log.error('Failed to delete channel', { error });
    return json({ error: 'Failed to delete channel' }, 500);
  }
}
