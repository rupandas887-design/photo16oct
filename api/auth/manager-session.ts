import crypto from 'crypto';
import {
  getServerSupabase,
  SUPABASE_ANON_KEY,
  MANAGER_ROLES_SET,
  cleanEmail,
  cleanPhone,
  resolveCallerAuthoritativeRole,
  signManagerSessionToken,
  setManagerSessionCookie,
} from '../_authHelpers';

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const db = getServerSupabase();
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
