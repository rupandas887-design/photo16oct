import {
  getServerSupabase,
  MANAGER_ROLES_SET,
  cleanEmail,
  authenticateCallerIdentity,
  resolveCallerAuthoritativeRole,
  signManagerSessionToken,
  setManagerSessionCookie,
  clearManagerSessionCookie,
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
    const callerIdentity = await authenticateCallerIdentity(db, req);
    if (!callerIdentity) {
      clearManagerSessionCookie(req, res);
      return res.status(401).json({ success: false, valid: false, error: 'Session missing or expired' });
    }
    const callerAuth = await resolveCallerAuthoritativeRole(db, callerIdentity);
    if (!callerAuth.active) {
      clearManagerSessionCookie(req, res);
      return res.status(403).json({ success: false, valid: false, error: 'Account is deactivated' });
    }

    let refreshedToken: string | undefined;
    if (MANAGER_ROLES_SET.has(callerAuth.role)) {
      refreshedToken = signManagerSessionToken({
        uid: String(callerIdentity.id || ''),
        email: cleanEmail(callerIdentity.email),
        role: callerAuth.role,
      });
      setManagerSessionCookie(req, res, refreshedToken);
    }

    return res.status(200).json({
      success: true,
      valid: true,
      userId: callerIdentity.id || null,
      email: callerIdentity.email || null,
      role: callerAuth.role,
      ...(refreshedToken ? { token: refreshedToken } : {}),
    });
  } catch (err: any) {
    console.error('[Vercel Auth Verify Session Error]', err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to verify session' });
  }
}
