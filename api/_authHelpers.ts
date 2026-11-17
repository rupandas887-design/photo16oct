import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://aqifyxsimhqayfjwzzwj.supabase.co';

export const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_Qdmf44q1ASJboY1_AZoOVQ_YfYrWvcB';

const hardcodedServiceKey = Buffer.from(
  'c2Jfc2VjcmV0X095RGl5S2JaQmE3MGNocndYR2puTFFfM0pQWXhFanQ=',
  'base64'
).toString('utf-8');

const envServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const SUPABASE_SERVICE_ROLE_KEY =
  envServiceKey && envServiceKey !== 'YOUR_SUPABASE_SERVICE_ROLE_KEY' && envServiceKey.trim() !== ''
    ? envServiceKey
    : hardcodedServiceKey;

export function getServerSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const MANAGER_ROLES_SET = new Set([
  'Business Owner',
  'Production Team',
  'Operations Team',
  'Sales Team',
]);

export const MANAGER_SESSION_COOKIE = 'erp_manager_session';
const MANAGER_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const cleanEmail = (val?: any): string =>
  val !== null && val !== undefined ? String(val).trim().toLowerCase() : '';

export const cleanPhone = (val?: any): string =>
  val !== null && val !== undefined ? String(val).replace(/\D/g, '') : '';

const getStaffVaultKey = (): Buffer => {
  const secretMaterial = `${SUPABASE_SERVICE_ROLE_KEY}::photocrew_staff_pwd_vault_v1`;
  return crypto.createHash('sha256').update(secretMaterial).digest();
};

export const encryptStaffPassword = (plainText: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getStaffVaultKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
};

export const decryptStaffPassword = (payload?: string | null): string | null => {
  if (!payload || typeof payload !== 'string' || !payload.startsWith('enc:v1:')) return null;
  try {
    const parts = payload.split(':');
    if (parts.length !== 5) return null;
    const iv = Buffer.from(parts[2], 'base64');
    const tag = Buffer.from(parts[3], 'base64');
    const data = Buffer.from(parts[4], 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getStaffVaultKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch (_) {
    return null;
  }
};

export const signManagerSessionToken = (payload: {
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

export const verifyManagerSessionToken = (
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

export const parseCookies = (req: any): Record<string, string> => {
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

export const isHttpsRequest = (req: any): boolean => {
  if (req?.secure) return true;
  const proto = String(req?.headers?.['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  return proto === 'https';
};

export const setManagerSessionCookie = (req: any, res: any, token: string) => {
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

export const clearManagerSessionCookie = (req: any, res: any) => {
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

export const extractNotesAuthUserIdServer = (notesVal: any): string | null => {
  if (!notesVal) return null;
  if (typeof notesVal === 'string') {
    const trimmed = notesVal.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        let parsed = JSON.parse(trimmed);
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        if (parsed && typeof parsed === 'object' && parsed.auth_user_id) {
          return String(parsed.auth_user_id).trim();
        }
      } catch (_) {}
    }
  } else if (typeof notesVal === 'object' && notesVal.auth_user_id) {
    return String(notesVal.auth_user_id).trim();
  }
  return null;
};

export const isSystemDivisionAccountServer = (opts: {
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

export const resolveCallerAuthoritativeRole = async (
  db: any,
  caller: {
    id?: string | null;
    email?: string | null;
    mobile?: string | null;
    metadataRole?: string | null;
  }
): Promise<{ role: string; active: boolean }> => {
  const callerId = String(caller.id || '').trim();
  const callerEmail = cleanEmail(caller.email);
  const callerMobile = cleanPhone(caller.mobile);
  const callerMob10 = callerMobile.length >= 10 ? callerMobile.slice(-10) : callerMobile;

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

  const sysRole = isSystemDivisionAccountServer({
    id: callerId || dbUserRow?.id,
    email: callerEmail || dbUserRow?.email,
  });
  if (sysRole) {
    return { role: sysRole, active: isActive };
  }

  const [opRes, prodRes] = await Promise.all([
    db.from('operations_staff').select('staff_id, email, mobile, notes, status'),
    db.from('production_staff').select('staff_id, email, mobile, notes, status'),
  ]);

  const matchesStaffRow = (row: any) => {
    if (!row) return false;
    const rStaffId = String(row.staff_id || '').trim();
    const rAuthId = extractNotesAuthUserIdServer(row.notes) || '';
    const rEmail = cleanEmail(row.email);
    const rMob = cleanPhone(row.mobile);
    const rMob10 = rMob.length >= 10 ? rMob.slice(-10) : rMob;
    if (callerId && (rStaffId === callerId || rAuthId === callerId)) return true;
    if (callerEmail && rEmail && rEmail === callerEmail) return true;
    if (callerMob10 && callerMob10.length >= 7 && rMob10 && rMob10 === callerMob10) return true;
    return false;
  };

  const inOp = (opRes.data || []).some(matchesStaffRow);
  const inProd = (prodRes.data || []).some(matchesStaffRow);

  if (inOp && !inProd) return { role: 'Operation Staff', active: isActive };
  if (inProd && !inOp) return { role: 'Production Staff', active: isActive };
  if (inOp && inProd) {
    const opAuth =
      callerId &&
      (opRes.data || []).some(
        (r: any) => extractNotesAuthUserIdServer(r.notes) === callerId || r.staff_id === callerId
      );
    const prodAuth =
      callerId &&
      (prodRes.data || []).some(
        (r: any) => extractNotesAuthUserIdServer(r.notes) === callerId || r.staff_id === callerId
      );
    if (opAuth && !prodAuth) return { role: 'Operation Staff', active: isActive };
    if (prodAuth && !opAuth) return { role: 'Production Staff', active: isActive };
    return { role: 'Operation Staff', active: isActive };
  }

  const rawRole = String(dbUserRow?.role || caller.metadataRole || '').trim();
  const lowerRole = rawRole.toLowerCase();
  if (lowerRole === 'production staff' || lowerRole.includes('editor')) {
    return { role: 'Production Staff', active: isActive };
  }
  if (
    lowerRole === 'operation staff' ||
    lowerRole === 'operations staff' ||
    lowerRole.includes('photographer') ||
    lowerRole.includes('drone') ||
    lowerRole.includes('cinematographer')
  ) {
    return { role: 'Operation Staff', active: isActive };
  }
  if (lowerRole.includes('owner') || lowerRole.includes('business')) {
    return { role: 'Business Owner', active: isActive };
  }
  if (lowerRole.includes('sales')) return { role: 'Sales Team', active: isActive };
  if (lowerRole.includes('production') || lowerRole.includes('prod')) {
    return { role: 'Production Team', active: isActive };
  }
  if (lowerRole.includes('operation') || lowerRole.includes('op')) {
    return { role: 'Operations Team', active: isActive };
  }

  return { role: rawRole || 'Operation Staff', active: isActive };
};

export const authenticateCallerIdentity = async (
  db: any,
  req: any
): Promise<{
  id?: string | null;
  email?: string | null;
  mobile?: string | null;
  metadataRole?: string | null;
} | null> => {
  const authHeader = String(req?.headers?.authorization || '').trim();
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const jwt = authHeader.slice(7).trim();
    if (jwt && jwt !== SUPABASE_ANON_KEY) {
      try {
        const { data: userData, error: jwtErr } = await db.auth.getUser(jwt);
        if (!jwtErr && userData?.user) {
          return {
            id: userData.user.id,
            email: userData.user.email,
            mobile: userData.user.user_metadata?.mobile,
            metadataRole: userData.user.user_metadata?.role,
          };
        }
      } catch (_) {}

      const verifiedBearerErp = verifyManagerSessionToken(jwt);
      if (verifiedBearerErp) {
        return {
          id: verifiedBearerErp.uid,
          email: verifiedBearerErp.email,
          metadataRole: verifiedBearerErp.role,
        };
      }
    }
  }

  const cookies = parseCookies(req);
  const erpToken = String(
    req?.headers?.['x-erp-session'] ||
      req?.headers?.['x-erp-session-token'] ||
      cookies[MANAGER_SESSION_COOKIE] ||
      ''
  ).trim();
  const verified = verifyManagerSessionToken(erpToken);
  if (verified) {
    return {
      id: verified.uid,
      email: verified.email,
      metadataRole: verified.role,
    };
  }

  return null;
};
