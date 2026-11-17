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

const cleanEmail = (val?: any): string =>
  val !== null && val !== undefined ? String(val).trim().toLowerCase() : '';

const cleanPhone = (val?: any): string =>
  val !== null && val !== undefined ? String(val).replace(/\D/g, '') : '';

const getStaffVaultKey = (): Buffer => {
  const secretMaterial = `${SUPABASE_SERVICE_ROLE_KEY}::photocrew_staff_pwd_vault_v1`;
  return crypto.createHash('sha256').update(secretMaterial).digest();
};

const encryptStaffPassword = (plainText: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getStaffVaultKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
};

const decryptStaffPassword = (payload?: string | null): string | null => {
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

const extractNotesAuthUserIdServer = (notesVal: any): string | null => {
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
      return res.status(401).json({
        success: false,
        error: 'Authentication required to view staff credentials.',
      });
    }

    const callerId = String(callerIdentity.id || '').trim();
    const callerEmail = cleanEmail(callerIdentity.email);
    const sysRole = isSystemDivisionAccountServer({ id: callerId, email: callerEmail });
    const callerRole = sysRole || String(callerIdentity.metadataRole || 'Business Owner');

    if (!new Set(['Business Owner', 'Production Team', 'Operations Team']).has(callerRole)) {
      return res.status(403).json({
        success: false,
        error: 'You are not authorized to view staff credentials.',
      });
    }

    const { staff_id, email, mobile, auth_id, staff_type } = req.body || {};
    const cleanEmailStr = cleanEmail(email);
    const cleanMobileStr = cleanPhone(mobile);
    const requestedType = String(staff_type || '').trim().toLowerCase();

    let targetDept: 'production' | 'operations' | null =
      requestedType === 'production'
        ? 'production'
        : requestedType === 'operations'
          ? 'operations'
          : null;
    let targetStaffRecord: any = null;

    if (staff_id) {
      if (targetDept === 'production') {
        const { data } = await db
          .from('production_staff')
          .select('*')
          .eq('staff_id', staff_id)
          .maybeSingle();
        if (data) targetStaffRecord = data;
      } else if (targetDept === 'operations') {
        const { data } = await db
          .from('operations_staff')
          .select('*')
          .eq('staff_id', staff_id)
          .maybeSingle();
        if (data) targetStaffRecord = data;
      } else {
        const [prodById, opById] = await Promise.all([
          db.from('production_staff').select('*').eq('staff_id', staff_id).maybeSingle(),
          db.from('operations_staff').select('*').eq('staff_id', staff_id).maybeSingle(),
        ]);
        if (prodById.data && !opById.data) {
          targetDept = 'production';
          targetStaffRecord = prodById.data;
        } else if (opById.data && !prodById.data) {
          targetDept = 'operations';
          targetStaffRecord = opById.data;
        }
      }
    }

    if (!targetStaffRecord && cleanEmailStr && targetDept) {
      const table = targetDept === 'production' ? 'production_staff' : 'operations_staff';
      const { data } = await db.from(table).select('*').ilike('email', cleanEmailStr).maybeSingle();
      if (data) targetStaffRecord = data;
    }

    const isHashedOrEncrypted = (val?: string | null): boolean => {
      if (!val || typeof val !== 'string') return true;
      const t = val.trim();
      if (!t || t === 'null' || t === 'undefined') return true;
      if (t.startsWith('enc:v1:') || t.startsWith('$2a$') || t.startsWith('$2b$') || t.startsWith('$argon2')) {
        return true;
      }
      if (/^[0-9a-f]{64}$/i.test(t) || /^[0-9a-f]{32}$/i.test(t)) return true;
      return false;
    };

    const staffRowRawPwd = targetStaffRecord?.Password ?? targetStaffRecord?.password ?? null;
    const staffRowPlain =
      typeof staffRowRawPwd === 'string' && !isHashedOrEncrypted(staffRowRawPwd)
        ? targetDept === 'production'
          ? staffRowRawPwd
          : staffRowRawPwd.trim()
        : null;

    let resolvedPassword: string | null = staffRowPlain;
    const resolvedStaffAuthId =
      targetStaffRecord?.auth_user_id ||
      extractNotesAuthUserIdServer(targetStaffRecord?.notes) ||
      auth_id ||
      null;

    if (!resolvedPassword && resolvedStaffAuthId && db.auth?.admin) {
      try {
        const { data: uData } = await db.auth.admin.getUserById(resolvedStaffAuthId);
        const encPwd = uData?.user?.app_metadata?.enc_pwd;
        if (encPwd) {
          const dec = decryptStaffPassword(encPwd);
          if (dec && !isHashedOrEncrypted(dec)) {
            resolvedPassword = dec;
          }
        }
        if (!resolvedPassword) {
          const metaPwd =
            uData?.user?.user_metadata?.current_password || uData?.user?.user_metadata?.password;
          if (metaPwd && !isHashedOrEncrypted(String(metaPwd))) {
            resolvedPassword = String(metaPwd);
          }
        }
      } catch (_) {}
    }

    if (!resolvedPassword && typeof staffRowRawPwd === 'string' && /^[0-9a-f]{64}$/i.test(staffRowRawPwd.trim())) {
      const hashTarget = staffRowRawPwd.trim().toLowerCase();
      const mob = cleanPhone(targetStaffRecord?.mobile || cleanMobileStr);
      const candidates = [mob, mob ? `${mob}@123` : ''].filter(Boolean);
      for (const cand of candidates) {
        const digest = crypto.createHash('sha256').update(cand).digest('hex').toLowerCase();
        if (digest === hashTarget) {
          resolvedPassword = cand;
          break;
        }
      }
    }

    if (resolvedPassword && resolvedStaffAuthId && db.auth?.admin) {
      db.auth.admin
        .updateUserById(resolvedStaffAuthId, {
          app_metadata: { enc_pwd: encryptStaffPassword(resolvedPassword) },
        })
        .catch(() => {});
    }

    return res.status(200).json({
      success: true,
      password: resolvedPassword || null,
      requiresReset: !resolvedPassword,
      hasPassword: Boolean(resolvedPassword),
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to retrieve staff password',
    });
  }
}
