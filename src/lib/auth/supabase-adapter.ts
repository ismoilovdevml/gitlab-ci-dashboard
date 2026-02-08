import { headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import prisma from '@/lib/db/prisma';
import { AuthUser } from './types';
import { createLogger } from '@/lib/logger';

const logger = createLogger('SupabaseAuth');

/**
 * Supabase JWT auth adapter for cloud mode.
 * Validates JWT from Authorization header against Supabase,
 * then maps the Supabase user to a local user record.
 */
export async function getSupabaseAuth(): Promise<AuthUser | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    logger.error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured');
    return null;
  }

  const headerStore = await headers();
  const authHeader = headerStore.get('authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const jwt = authHeader.slice(7);

  // Validate JWT with Supabase
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: { user: supabaseUser }, error } = await supabase.auth.getUser(jwt);

  if (error || !supabaseUser) {
    logger.warn('Supabase JWT validation failed', { error: error?.message });
    return null;
  }

  // Find or create local user linked to Supabase user
  let localUser = await prisma.user.findFirst({
    where: { email: supabaseUser.email },
  });

  if (!localUser) {
    // Auto-provision local user for cloud mode
    localUser = await prisma.user.create({
      data: {
        username: supabaseUser.email?.split('@')[0] || supabaseUser.id.slice(0, 8),
        password: '', // No password for cloud users (JWT only)
        email: supabaseUser.email,
        role: 'user',
        isActive: true,
        gitlabUrl: 'https://gitlab.com',
        gitlabToken: '',
      },
    });
    logger.info('Auto-provisioned local user for cloud auth', {
      userId: localUser.id,
      email: localUser.email,
    });
  }

  if (!localUser.isActive) {
    return null;
  }

  // Extract org context from JWT metadata if available
  const orgId = supabaseUser.user_metadata?.organization_id ?? null;

  return {
    id: localUser.id,
    username: localUser.username,
    email: localUser.email,
    role: localUser.role,
    isActive: localUser.isActive,
    gitlabUrl: localUser.gitlabUrl,
    gitlabToken: localUser.gitlabToken,
    organizationId: orgId,
    theme: localUser.theme,
    autoRefresh: localUser.autoRefresh,
    refreshInterval: localUser.refreshInterval,
    notifyPipelineFailures: localUser.notifyPipelineFailures,
    notifyPipelineSuccess: localUser.notifyPipelineSuccess,
  };
}
