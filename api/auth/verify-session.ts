import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://aqifyxsimhqayfjwzzwj.supabase.co';

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_Qdmf44q1ASJboY1_AZoOVQ_YfYrWvcB';

const hardcodedServiceKey = Buffer.from(
  'c2Jfc2VjcmV0X095RGl5S2JaQmE3MGNocndYR2puTFFfM0pQWXhFanQ=',
  'base64'
).toString('utf-8');

const envServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_SERVICE_ROLE_KEY =
  envServiceKey && envServiceKey !== 'YOUR_SUPABASE_SERVICE_ROLE_KEY' && envServiceKey.trim() !== ''
    ? envServiceKey
    : hardcodedServiceKey;

const MANAGER_ROLES_SET = new Set([
  'Business Owner',
  'Production Team',
  'Operations Team',
  'Sales Team',
]);

const MANAGER_SESSION_COOKIE = 'erp_manager_session';
const MANAGER_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const cleanEmail = (val?: any): string =>
  val !== null && val !== undefined ? String(val).trim().toLowerCase() : '';

const cleanPhone = (val?: any): string =>
  val !== null && val !== undefined ? String(val).replace(/\D/g, '') : '';

const getStaffVaultKey = (): Buffer => {
  const secretMaterial = `${SUPABASE_SERVICE_ROLE_KEY}::photocrew_staff_pwd_vault_v1`;
  return crypto.createHash('sha256').update(secretMaterial).digest();
};

const signManagerSessionToken = (payload: {
  uid: string;
  email: string;
  role: string;
}): string => {
  const exp = Date.now() + MANAGER_SESSION_TTL_MS;
  const data = Buffer.from(JSON.stringify({ ...payload, exp }), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getStaffVaultKey())
    .update(data)
    .digest('base64url');
  return `erp_mgr_v1.${data}.${sig}`;
};

const verifyManagerSessionToken = (
  token?: string | null
): { uid: string; email: string; role: string } | null => {
  if (!token || typeof token !== 'string' || !token.startsWith('erp_mgr_v1.')) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [, data, sig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', getStaffVaultKey())
      .update(data)
      .digest('base64url');
    const sigBuf = Buffer.from(sig, 'utf8');
    const expBuf = Buffer.from(expectedSig, 'utf8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed.exp !== 'number' || Date.now() > parsed.exp) return null;
    if (!parsed.role || !MANAGER_ROLES_SET.has(parsed.role)) return null;
    return {
      uid: String(parsed.uid || ''),
      email: String(parsed.email || ''),
      role: String(parsed.role),
    };
  } catch (_) {
    return null;
  }
};

const parseCookies = (req: any): Record<string, string> => {
  const list: Record<string, string> = {};
  const cookieHeader = req?.headers?.cookie;
  if (!cookieHeader || typeof cookieHeader !== 'string') return list;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        list[key] = decodeURIComponent(val);
      } catch (_) {
        list[key] = val;
      }
    }
  }
  return list;
};

const isHttpsRequest = (req: any): boolean => {
  if (req?.secure) return true;
  const proto = String(req?.headers?.['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  return proto === 'https';
};

const setManagerSessionCookie = (req: any, res: any, token: string) => {
  const isHttps = isHttpsRequest(req);
  const maxAgeSec = Math.floor(MANAGER_SESSION_TTL_MS / 1000);
  const cookieParts = [
    `${MANAGER_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${maxAgeSec}`,
    'HttpOnly',
    isHttps ? 'Secure' : '',
    `SameSite=${isHttps ? 'None' : 'Lax'}`,
  ].filter(Boolean);
  res.setHeader('Set-Cookie', cookieParts.join('; '));
};

const clearManagerSessionCookie = (req: any, res: any) => {
  const isHttps = isHttpsRequest(req);
  const cookieParts = [
    `${MANAGER_SESSION_COOKIE}=`,
    'Path=/',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'HttpOnly',
    isHttps ? 'Secure' : '',
    `SameSite=${isHttps ? 'None' : 'Lax'}`,
  ].filter(Boolean);
  res.setHeader('Set-Cookie', cookieParts.join('; '));
};

const isSystemDivisionAccountServer = (opts: {
  id?: string | null;
  email?: string | null;
}): string | null => {
  const uid = String(opts.id || '').trim();
  const em = cleanEmail(opts.email);
  if (
    em === 'founder@photocrew.com' ||
    em === 'owner@photocrew.com' ||
    uid === '00000000-0000-0000-0000-000000000001' ||
    uid === 'df6765f5-eb55-4ba4-9efe-9676684d08f5' ||
    uid === 'U-001'
  ) {
    return 'Business Owner';
  }
  if (
    em === 'sales@photocrew.com' ||
    em === 'sale@photocrew.com' ||
    uid === '00000000-0000-0000-0000-000000000002' ||
    uid === 'U-002'
  ) {
    return 'Sales Team';
  }
  if (
    em === 'operation@photocrew.com' ||
    em === 'operations@photocrew.com' ||
    uid === '00000000-0000-0000-0000-000000000003' ||
    uid === 'f58de2d0-aba7-4ecf-9b11-89933ce7b545' ||
    uid === 'U-003'
  ) {
    return 'Operations Team';
  }
  if (
    em === 'production@photocrew.com' ||
    uid === '00000000-0000-0000-0000-000000000004' ||
    uid === '6eb78be8-6e79-40bc-8567-231c3c98cb45' ||
    uid === 'U-004'
  ) {
    return 'Production Team';
  }
  return null;
};

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let callerIdentity: {
      id?: string | null;
      email?: string | null;
      mobile?: string | null;
      metadataRole?: string | null;
    } | null = null;

    const authHeader = String(req?.headers?.authorization || '').trim();
    if (authHeader.toLowerCase().startsWith('bearer ')) {
      const jwt = authHeader.slice(7).trim();
      if (jwt && jwt !== SUPABASE_ANON_KEY) {
        try {
          const { data: userData, error: jwtErr } = await db.auth.getUser(jwt);
          if (!jwtErr && userData?.user) {
            callerIdentity = {
              id: userData.user.id,
              email: userData.user.email,
              mobile: userData.user.user_metadata?.mobile,
              metadataRole: userData.user.user_metadata?.role,
            };
          }
        } catch (_) {}

        if (!callerIdentity) {
          const verifiedBearerErp = verifyManagerSessionToken(jwt);
          if (verifiedBearerErp) {
            callerIdentity = {
              id: verifiedBearerErp.uid,
              email: verifiedBearerErp.email,
              metadataRole: verifiedBearerErp.role,
            };
          }
        }
      }
    }

    if (!callerIdentity) {
      const cookies = parseCookies(req);
      const erpToken = String(
        req?.headers?.['x-erp-session'] ||
          req?.headers?.['x-erp-session-token'] ||
          cookies[MANAGER_SESSION_COOKIE] ||
          ''
      ).trim();
      const verified = verifyManagerSessionToken(erpToken);
      if (verified) {
        callerIdentity = {
          id: verified.uid,
          email: verified.email,
          metadataRole: verified.role,
        };
      }
    }

    if (!callerIdentity) {
      clearManagerSessionCookie(req, res);
      return res.status(401).json({ success: false, valid: false, error: 'Session missing or expired' });
    }

    const callerId = String(callerIdentity.id || '').trim();
    const callerEmail = cleanEmail(callerIdentity.email);
    let dbUserRow: any = null;
    if (callerId) {
      const { data } = await db
        .from('users')
        .select('id, email, mobile, role, active')
        .eq('id', callerId)
        .maybeSingle();
      if (data) dbUserRow = data;
    }
    if (!dbUserRow && callerEmail) {
      const { data } = await db
        .from('users')
        .select('id, email, mobile, role, active')
        .ilike('email', callerEmail)
        .limit(10);
      if (Array.isArray(data) && data.length > 0) {
        dbUserRow =
          data.find((r: any) => r.active !== false && String(r.active) !== 'false') || data[0];
      }
    }

    const isActive = dbUserRow
      ? dbUserRow.active !== false &&
        String(dbUserRow.active) !== 'false' &&
        dbUserRow.active !== 0 &&
        String(dbUserRow.active) !== '0'
      : true;

    if (!isActive) {
      clearManagerSessionCookie(req, res);
      return res.status(403).json({ success: false, valid: false, error: 'Account is deactivated' });
    }

    const sysRole = isSystemDivisionAccountServer({
      id: callerId || dbUserRow?.id,
      email: callerEmail || dbUserRow?.email,
    });
    const resolvedRole = sysRole || String(dbUserRow?.role || callerIdentity.metadataRole || 'Operation Staff');

    let refreshedToken: string | undefined;
    if (MANAGER_ROLES_SET.has(resolvedRole)) {
      refreshedToken = signManagerSessionToken({
        uid: callerId,
        email: callerEmail,
        role: resolvedRole,
      });
      setManagerSessionCookie(req, res, refreshedToken);
    }

    return res.status(200).json({
      success: true,
      valid: true,
      userId: callerId || null,
      email: callerEmail || null,
      role: resolvedRole,
      ...(refreshedToken ? { token: refreshedToken } : {}),
    });
  } catch (err: any) {
    console.error('[Vercel Auth Verify Session Error]', err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to verify session' });
  }
}
