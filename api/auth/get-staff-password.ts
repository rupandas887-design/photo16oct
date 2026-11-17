import crypto from 'crypto';
import {
  getServerSupabase,
  cleanEmail,
  cleanPhone,
  authenticateCallerIdentity,
  resolveCallerAuthoritativeRole,
  decryptStaffPassword,
  encryptStaffPassword,
  extractNotesAuthUserIdServer,
  isSystemDivisionAccountServer,
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
      return res.status(401).json({
        success: false,
        error: 'Authentication required to view staff credentials.',
      });
    }

    const callerAuth = await resolveCallerAuthoritativeRole(db, callerIdentity);
    if (!callerAuth.active) {
      return res.status(403).json({ success: false, error: 'Account is deactivated.' });
    }
    if (!new Set(['Business Owner', 'Production Team', 'Operations Team']).has(callerAuth.role)) {
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

    if (callerAuth.role === 'Production Team' && targetDept === 'operations') {
      return res.status(403).json({
        success: false,
        error: 'Production Manager can only view Production staff credentials.',
      });
    }
    if (callerAuth.role === 'Operations Team' && targetDept === 'production') {
      return res.status(403).json({
        success: false,
        error: 'Operation Manager can only view Operation staff credentials.',
      });
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
