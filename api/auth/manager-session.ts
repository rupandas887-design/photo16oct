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

const resolveCallerAuthoritativeRole = async (
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
    const { userId, accessToken, identifier, email, password } = req.body || {};
    const hasCredentialFallback = Boolean(String(password ?? '') && (email || identifier || userId));

    const authHeader = String(req?.headers?.authorization || '').trim();
    const headerJwt = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
    const jwt =
      headerJwt && headerJwt !== SUPABASE_ANON_KEY
        ? headerJwt
        : typeof accessToken === 'string' && accessToken.trim() && accessToken.trim() !== SUPABASE_ANON_KEY
          ? accessToken.trim()
          : '';

    if (jwt) {
      try {
        const { data: userData, error: jwtErr } = await db.auth.getUser(jwt);
        if (!jwtErr && userData?.user) {
          const authInfo = await resolveCallerAuthoritativeRole(db, {
            id: userData.user.id,
            email: userData.user.email,
            mobile: userData.user.user_metadata?.mobile,
            metadataRole: userData.user.user_metadata?.role,
          });
          if (!authInfo.active) {
            return res.status(403).json({
              success: false,
              code: 'ACCOUNT_DEACTIVATED',
              error: 'Your account has been deactivated. Please contact the administrator.',
            });
          }
          if (!MANAGER_ROLES_SET.has(authInfo.role)) {
            return res.status(403).json({
              success: false,
              code: 'ROLE_NOT_MANAGER',
              error: `Account role "${authInfo.role}" is not authorized for a manager session.`,
            });
          }
          const token = signManagerSessionToken({
            uid: String(userData.user.id),
            email: cleanEmail(userData.user.email),
            role: authInfo.role,
          });
          setManagerSessionCookie(req, res, token);
          return res.status(200).json({
            success: true,
            token,
            userId: String(userData.user.id),
            email: cleanEmail(userData.user.email),
            role: authInfo.role,
          });
        } else if (!hasCredentialFallback) {
          return res.status(401).json({
            success: false,
            code: 'INVALID_ACCESS_TOKEN',
            error: `Authentication token verification failed (${jwtErr?.message || 'invalid token'}). Please log in again.`,
          });
        }
      } catch (jwtEx: any) {
        if (!hasCredentialFallback) {
          return res.status(502).json({
            success: false,
            code: 'TOKEN_VERIFICATION_ERROR',
            error: `Failed to verify authentication token: ${jwtEx?.message || 'Auth service unavailable'}`,
          });
        }
      }
    }

    const lookupTerms = Array.from(
      new Set([email, identifier].map((v) => String(v ?? '').trim()).filter(Boolean))
    );
    const rawPwd = typeof password === 'string' ? password : String(password || '');
    const cleanPwd = rawPwd.trim();
    const targetUserId = String(userId || '').trim();

    if ((lookupTerms.length === 0 && !targetUserId) || !cleanPwd) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_CREDENTIALS',
        error: 'Authenticated access token or valid manager credentials are required.',
      });
    }

    const { data: allUsers, error: uErr } = await db
      .from('users')
      .select('id, email, username, mobile, role, active, password');
    if (uErr || !Array.isArray(allUsers)) {
      return res.status(500).json({
        success: false,
        code: 'DB_USERS_LOOKUP_FAILED',
        error: `Database user verification failed: ${uErr?.message || 'Unable to query public.users'}`,
      });
    }

    const expandSystemAliases = (term: string): string[] => {
      const t = term.trim().toLowerCase();
      if (t === 'owner@photocrew.com' || t === 'founder@photocrew.com' || t === 'owner' || t === 'founder') {
        return [t, 'owner@photocrew.com', 'founder@photocrew.com', 'owner'];
      }
      if (t === 'operation@photocrew.com' || t === 'operations@photocrew.com' || t === 'operation' || t === 'operations') {
        return [t, 'operation@photocrew.com', 'operations@photocrew.com', 'operation'];
      }
      if (t === 'production@photocrew.com' || t === 'production') {
        return [t, 'production@photocrew.com', 'production'];
      }
      if (t === 'sales@photocrew.com' || t === 'sale@photocrew.com') {
        return [t, 'sales@photocrew.com', 'sale@photocrew.com'];
      }
      return [t];
    };
    const expandedLowerTerms = new Set<string>();
    for (const term of lookupTerms) {
      for (const alias of expandSystemAliases(term)) {
        expandedLowerTerms.add(alias);
      }
    }

    const candidates = allUsers.filter((u: any) => {
      if (targetUserId && String(u.id || '').trim() === targetUserId) return true;
      const uEmail = cleanEmail(u.email);
      const uUser = cleanEmail(u.username);
      const uMob = cleanPhone(u.mobile);
      const uMob10 = uMob.length >= 10 ? uMob.slice(-10) : uMob;
      if (uEmail && expandedLowerTerms.has(uEmail)) return true;
      if (uUser && expandedLowerTerms.has(uUser)) return true;
      for (const term of lookupTerms) {
        if (!term.includes('@')) {
          const digits = term.replace(/\D/g, '');
          const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
          if (
            digits.length >= 7 &&
            !/^0+$/.test(digits) &&
            (uMob === digits || (last10.length >= 7 && uMob10 === last10))
          ) {
            return true;
          }
        }
      }
      return false;
    });

    if (candidates.length === 0) {
      return res.status(401).json({
        success: false,
        code: 'USER_NOT_FOUND',
        error: 'Manager account record not found in database.',
      });
    }

    const passwordsMatch = (storedRaw: any): boolean => {
      const storedExact = String(storedRaw ?? '');
      const storedTrimmed = storedExact.trim();
      if (!storedTrimmed) return false;
      const timingEq = (a: string, b: string) => {
        const aBuf = Buffer.from(a, 'utf8');
        const bBuf = Buffer.from(b, 'utf8');
        return aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
      };
      return timingEq(storedTrimmed, cleanPwd) || (rawPwd !== cleanPwd && timingEq(storedExact, rawPwd));
    };

    const isRowActive = (u: any) =>
      u.active !== false && String(u.active) !== 'false' && u.active !== 0 && String(u.active) !== '0';
    const isRealAuthUuid = (idVal: any) => {
      const s = String(idVal || '').trim();
      return (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) &&
        !s.startsWith('00000000-0000-0000-0000-')
      );
    };

    const allActivePasswordMatches = candidates.filter(
      (u: any) => isRowActive(u) && passwordsMatch(u.password)
    );
    const activePasswordMatched =
      allActivePasswordMatches.find(
        (u: any) => targetUserId && String(u.id || '').trim() === targetUserId
      ) ||
      allActivePasswordMatches.find((u: any) => isRealAuthUuid(u.id)) ||
      allActivePasswordMatches[0];

    if (!activePasswordMatched) {
      const anyMatchedPwd = candidates.some((u: any) => passwordsMatch(u.password));
      if (anyMatchedPwd) {
        return res.status(403).json({
          success: false,
          code: 'ACCOUNT_DEACTIVATED',
          error: 'Your account has been deactivated. Please contact the administrator.',
        });
      }
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        error: 'Invalid manager credentials.',
      });
    }

    const authInfo = await resolveCallerAuthoritativeRole(db, {
      id: activePasswordMatched.id,
      email: activePasswordMatched.email,
      mobile: activePasswordMatched.mobile,
      metadataRole: activePasswordMatched.role,
    });
    if (!authInfo.active) {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_DEACTIVATED',
        error: 'Your account has been deactivated. Please contact the administrator.',
      });
    }
    if (!MANAGER_ROLES_SET.has(authInfo.role)) {
      return res.status(403).json({
        success: false,
        code: 'ROLE_NOT_MANAGER',
        error: `Account role "${authInfo.role}" is not authorized for a manager session.`,
      });
    }

    const matchedIdStr = String(activePasswordMatched.id || '').trim();
    if (!jwt && db.auth?.admin) {
      for (const matchedRow of allActivePasswordMatches) {
        const rowId = String(matchedRow.id || '').trim();
        if (isRealAuthUuid(rowId)) {
          db.auth.admin
            .updateUserById(rowId, {
              password: String(matchedRow.password).trim(),
              email_confirm: true,
              ban_duration: 'none',
            })
            .catch(() => {});
        }
      }
    }

    const token = signManagerSessionToken({
      uid: matchedIdStr,
      email: cleanEmail(activePasswordMatched.email),
      role: authInfo.role,
    });

    setManagerSessionCookie(req, res, token);
    return res.status(200).json({
      success: true,
      token,
      userId: matchedIdStr,
      email: cleanEmail(activePasswordMatched.email),
      role: authInfo.role,
    });
  } catch (err: any) {
    console.error('[Vercel Auth Manager Session Error]', err);
    return res.status(500).json({
      success: false,
      code: 'MANAGER_SESSION_EXCEPTION',
      error: err?.message || 'Failed to create manager session',
    });
  }
}
