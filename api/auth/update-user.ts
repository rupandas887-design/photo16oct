import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://aqifyxsimhqayfjwzzwj.supabase.co';

const hardcodedServiceKey = Buffer.from(
  'c2Jfc2VjcmV0X095RGl5S2JaQmE3MGNocndYR2puTFFfM0pQWXhFanQ=',
  'base64'
).toString('utf-8');

const envServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_SERVICE_ROLE_KEY =
  envServiceKey && envServiceKey !== 'YOUR_SUPABASE_SERVICE_ROLE_KEY' && envServiceKey.trim() !== ''
    ? envServiceKey
    : hardcodedServiceKey;

const cleanEmail = (val?: any): string =>
  val !== null && val !== undefined ? String(val).trim().toLowerCase() : '';

const cleanPhone = (val?: any): string => {
  if (val === null || val === undefined) return '';
  const cleaned = String(val).replace(/\D/g, '');
  return cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
};

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

const parseNotesAuthId = (notesVal: any): string | null => {
  if (!notesVal) return null;
  try {
    let parsed = typeof notesVal === 'string' ? JSON.parse(notesVal) : notesVal;
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    if (parsed?.auth_user_id) return String(parsed.auth_user_id).trim();
    if (parsed?.notes && typeof parsed.notes === 'string') {
      const nested = JSON.parse(parsed.notes);
      if (nested?.auth_user_id) return String(nested.auth_user_id).trim();
    }
  } catch (_) {}
  return null;
};

const normalizeAuthRole = (role?: string | null, staffType?: string | null): string => {
  const r = String(role || '').trim().toLowerCase();
  const st = String(staffType || '').trim().toLowerCase();
  if (st === 'production' || r.includes('prod') || r.includes('editor')) return 'Production Team';
  if (st === 'operations') return 'Operation Staff';
  if (r === 'business owner' || r.includes('owner')) return 'Business Owner';
  if (r.includes('sales')) return 'Sales Team';
  if (r.includes('op') && r.includes('team')) return 'Operations Team';
  return 'Operation Staff';
};

async function findAuthUserPaginated(
  db: any,
  opts: { authId?: string | null; email?: string | null; mobile?: string | null; allowEmailMismatch?: boolean }
): Promise<any | null> {
  const targetEmail = cleanEmail(opts.email);
  const targetMobile = cleanPhone(opts.mobile);

  const isMatchingUser = (user: any, allowMismatch?: boolean): boolean => {
    if (!user) return false;
    if (allowMismatch || !targetEmail) return true;
    const authEmail = cleanEmail(user.email);
    const origEmail = cleanEmail(user.user_metadata?.original_email);
    const metaMobile = cleanPhone(user.user_metadata?.mobile);
    if (!authEmail || authEmail === targetEmail) return true;
    if (origEmail && origEmail === targetEmail) return true;
    if (targetMobile && targetMobile.length >= 7 && metaMobile && metaMobile === targetMobile) return true;
    if (targetMobile && targetMobile.length >= 7 && authEmail === `${targetMobile}@photocrew.com`) return true;
    return false;
  };

  if (opts.authId) {
    try {
      const { data: byIdData, error: byIdErr } = await db.auth.admin.getUserById(opts.authId);
      if (!byIdErr && byIdData?.user && isMatchingUser(byIdData.user, opts.allowEmailMismatch)) {
        return byIdData.user;
      }
    } catch (_) {}
  }

  if (!targetEmail && (!targetMobile || targetMobile.length < 7 || targetMobile === '0000000000')) {
    return null;
  }

  // Fast path 1: check staff tables (operations_staff & production_staff) for notes.auth_user_id
  try {
    const [opCheck, prodCheck] = await Promise.all([
      targetEmail
        ? db.from('operations_staff').select('notes, mobile').ilike('email', targetEmail).maybeSingle()
        : db.from('operations_staff').select('notes, mobile').eq('mobile', targetMobile).maybeSingle(),
      targetEmail
        ? db.from('production_staff').select('notes, mobile').ilike('email', targetEmail).maybeSingle()
        : db.from('production_staff').select('notes, mobile').eq('mobile', targetMobile).maybeSingle(),
    ]);
    const notesIds = [
      parseNotesAuthId(opCheck?.data?.notes),
      parseNotesAuthId(prodCheck?.data?.notes),
    ].filter(Boolean) as string[];
    for (const nid of notesIds) {
      if (nid && nid !== opts.authId) {
        const { data: byIdData, error: byIdErr } = await db.auth.admin.getUserById(nid);
        if (!byIdErr && byIdData?.user) {
          return byIdData.user;
        }
      }
    }
  } catch (_) {}

  // Fast path 2: check public.users by email/mobile
  if (targetEmail) {
    try {
      const { data: uRow } = await db.from('users').select('id').ilike('email', targetEmail).maybeSingle();
      if (uRow?.id && uRow.id !== opts.authId) {
        const { data: byIdData, error: byIdErr } = await db.auth.admin.getUserById(uRow.id);
        if (!byIdErr && byIdData?.user && isMatchingUser(byIdData.user, false)) {
          return byIdData.user;
        }
      }
    } catch (_) {}
  }
  if (targetMobile && targetMobile.length >= 7 && targetMobile !== '0000000000') {
    try {
      const { data: uRow } = await db.from('users').select('id').eq('mobile', targetMobile).maybeSingle();
      if (uRow?.id && uRow.id !== opts.authId) {
        const { data: byIdData, error: byIdErr } = await db.auth.admin.getUserById(uRow.id);
        if (!byIdErr && byIdData?.user) {
          return byIdData.user;
        }
      }
    } catch (_) {}
  }

  // Paginated scan with small perPage (10) so corrupt legacy pages are skipped cleanly
  let page = 1;
  const perPage = 10;
  let mobileCandidate: any = null;
  let consecutiveErrors = 0;

  while (page <= 80) {
    try {
      const { data: listData, error: listErr } = await db.auth.admin.listUsers({ page, perPage });
      if (listErr) {
        consecutiveErrors++;
        if (consecutiveErrors >= 5) break;
        page++;
        continue;
      }
      consecutiveErrors = 0;
      const usersList = listData?.users || [];
      if (usersList.length === 0) break;

      if (targetEmail) {
        const emailMatch = usersList.find(
          (u: any) =>
            cleanEmail(u.email) === targetEmail ||
            cleanEmail(u.user_metadata?.original_email) === targetEmail
        );
        if (emailMatch) return emailMatch;
      }

      if (!mobileCandidate && targetMobile && targetMobile.length >= 7 && targetMobile !== '0000000000') {
        mobileCandidate =
          usersList.find((u: any) => {
            const uPhone = cleanPhone(u.phone);
            const uMetaMob = cleanPhone(u.user_metadata?.mobile);
            const uEm = cleanEmail(u.email);
            return (
              (uPhone && uPhone === targetMobile) ||
              (uMetaMob && uMetaMob === targetMobile) ||
              uEm === `${targetMobile}@photocrew.com`
            );
          }) || null;
        if (!targetEmail && mobileCandidate) return mobileCandidate;
      }

      if (usersList.length < perPage) break;
      page++;
    } catch (_) {
      consecutiveErrors++;
      if (consecutiveErrors >= 5) break;
      page++;
    }
  }

  return mobileCandidate || null;
}

async function createOrRecoverAuthUser(
  db: any,
  params: {
    email?: string | null;
    mobile?: string | null;
    staffId?: string | null;
    password: string;
    name?: string;
    normalizedRole: string;
    active?: boolean;
    encPwd: string;
  }
): Promise<{ user: any | null; error?: string }> {
  const cleanEmailStr = cleanEmail(params.email);
  const cleanMobileStr = cleanPhone(params.mobile);
  const primaryEmail = cleanEmailStr || `${cleanMobileStr || 'staff'}@photocrew.com`;
  const baseUserMeta = {
    name: params.name || 'Staff Member',
    role: params.normalizedRole || 'Operation Staff',
    mobile: cleanMobileStr || '',
    ...(cleanEmailStr ? { original_email: cleanEmailStr } : {}),
  };

  const { data, error } = await db.auth.admin.createUser({
    email: primaryEmail,
    password: params.password,
    email_confirm: true,
    ...(params.active === false ? { ban_duration: '876000h' } : {}),
    user_metadata: baseUserMeta,
    app_metadata: { enc_pwd: params.encPwd },
  });

  if (!error && data?.user) {
    return { user: data.user };
  }

  const errMsg = String(error?.message || '').toLowerCase();
  const isAlreadyExists =
    errMsg.includes('already') || errMsg.includes('registered') || errMsg.includes('exists');
  const isGoTrueDbError =
    errMsg.includes('database error') ||
    errMsg.includes('checking email') ||
    errMsg.includes('loading user') ||
    errMsg.includes('unexpected_failure');

  if (isAlreadyExists) {
    const existingAuth = await findAuthUserPaginated(db, {
      email: primaryEmail,
      mobile: cleanMobileStr || null,
      allowEmailMismatch: true,
    });
    if (existingAuth) {
      const cleanedMeta = { ...(existingAuth.user_metadata || {}), ...baseUserMeta };
      delete cleanedMeta.current_password;
      const { data: updData, error: updErr } = await db.auth.admin.updateUserById(existingAuth.id, {
        password: params.password,
        email_confirm: true,
        ...(params.active !== undefined ? { ban_duration: params.active === false ? '876000h' : 'none' } : {}),
        user_metadata: cleanedMeta,
        app_metadata: { ...(existingAuth.app_metadata || {}), enc_pwd: params.encPwd },
      });
      if (!updErr && (updData?.user || existingAuth)) {
        return { user: updData?.user || existingAuth };
      }
    }
  }

  if (isGoTrueDbError || isAlreadyExists) {
    const staffSlug = String(params.staffId || cleanMobileStr || Date.now())
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase();
    const aliasCandidates: string[] = [];
    if (cleanMobileStr && cleanMobileStr.length >= 7 && `${cleanMobileStr}@photocrew.com` !== primaryEmail) {
      aliasCandidates.push(`${cleanMobileStr}@photocrew.com`);
    }
    if (staffSlug) {
      aliasCandidates.push(`staff.${staffSlug}@photocrew.com`);
    }
    aliasCandidates.push(`auth.${cleanMobileStr || staffSlug || 'user'}.${Date.now()}@photocrew.com`);

    for (const aliasEmail of aliasCandidates) {
      const existingAlias = await findAuthUserPaginated(db, {
        email: aliasEmail,
        mobile: cleanMobileStr || null,
        allowEmailMismatch: true,
      });
      if (existingAlias) {
        const cleanedMeta = { ...(existingAlias.user_metadata || {}), ...baseUserMeta };
        delete cleanedMeta.current_password;
        const { data: updAlias, error: updAliasErr } = await db.auth.admin.updateUserById(existingAlias.id, {
          password: params.password,
          email_confirm: true,
          ...(params.active !== undefined ? { ban_duration: params.active === false ? '876000h' : 'none' } : {}),
          user_metadata: cleanedMeta,
          app_metadata: { ...(existingAlias.app_metadata || {}), enc_pwd: params.encPwd },
        });
        if (!updAliasErr && (updAlias?.user || existingAlias)) {
          return { user: updAlias?.user || existingAlias };
        }
      }

      const { data: aliasCreated, error: aliasErr } = await db.auth.admin.createUser({
        email: aliasEmail,
        password: params.password,
        email_confirm: true,
        ...(params.active === false ? { ban_duration: '876000h' } : {}),
        user_metadata: baseUserMeta,
        app_metadata: { enc_pwd: params.encPwd },
      });
      if (!aliasErr && aliasCreated?.user) {
        return { user: aliasCreated.user };
      }
    }
  }

  return { user: null, error: error?.message || 'Failed to configure authentication credentials' };
}

async function syncPublicUserRow(
  db: any,
  params: {
    authUserId: string;
    name?: string;
    email?: string | null;
    mobile?: string | null;
    normalizedRole?: string;
    active?: boolean;
  }
): Promise<any | null> {
  const cleanEmailStr = cleanEmail(params.email);
  const cleanMobileStr = cleanPhone(params.mobile);

  let existingById: any = null;
  let existingByEmail: any = null;

  try {
    const { data } = await db.from('users').select('*').eq('id', params.authUserId).maybeSingle();
    if (data) existingById = data;
  } catch (_) {}

  if (cleanEmailStr) {
    try {
      const { data } = await db.from('users').select('*').ilike('email', cleanEmailStr).maybeSingle();
      if (data) existingByEmail = data;
    } catch (_) {}
  }

  let resolvedRowId = params.authUserId;
  let useInPlaceUpdateOnEmail = false;

  if (existingByEmail && existingByEmail.id !== params.authUserId) {
    if (existingById) {
      try {
        const { error: delErr } = await db.from('users').delete().eq('id', existingByEmail.id);
        if (delErr) useInPlaceUpdateOnEmail = true;
      } catch (_) {
        useInPlaceUpdateOnEmail = true;
      }
    } else {
      try {
        const { error: updIdErr } = await db
          .from('users')
          .update({ id: params.authUserId, password: null })
          .eq('id', existingByEmail.id);
        if (!updIdErr) {
          existingById = { ...existingByEmail, id: params.authUserId };
        } else {
          resolvedRowId = existingByEmail.id;
          existingById = existingByEmail;
          useInPlaceUpdateOnEmail = true;
        }
      } catch (_) {
        resolvedRowId = existingByEmail.id;
        existingById = existingByEmail;
        useInPlaceUpdateOnEmail = true;
      }
    }
  }

  const baseRow: any = {
    id: useInPlaceUpdateOnEmail && existingById ? existingById.id : resolvedRowId,
    name: params.name || existingById?.name || existingByEmail?.name || 'Staff',
    email: cleanEmailStr || existingById?.email || existingByEmail?.email || `${cleanMobileStr || 'staff'}@photocrew.com`,
    mobile: cleanMobileStr || existingById?.mobile || existingByEmail?.mobile || '0000000000',
    role: params.normalizedRole || existingById?.role || existingByEmail?.role || 'Operation Staff',
    active: params.active !== undefined ? params.active : (existingById?.active ?? existingByEmail?.active ?? true),
    password: null,
  };

  let attemptPayload = { ...baseRow };
  if (!existingById && attemptPayload.email) {
    attemptPayload.username = attemptPayload.email;
    attemptPayload.created_at = new Date().toISOString();
  }
  let res = existingById
    ? await db.from('users').update(attemptPayload).eq('id', attemptPayload.id).select()
    : await db.from('users').upsert(attemptPayload, { onConflict: 'id' }).select();

  if (res.error && res.error.message && res.error.message.includes('username')) {
    delete attemptPayload.username;
    res = existingById
      ? await db.from('users').update(attemptPayload).eq('id', attemptPayload.id).select()
      : await db.from('users').upsert(attemptPayload, { onConflict: 'id' }).select();
  }
  if (res.error && existingByEmail && !existingById) {
    const { id: _ignoredId, ...emailUpdates } = attemptPayload;
    res = await db.from('users').update(emailUpdates).eq('id', existingByEmail.id).select();
  }
  return res.data?.[0] || attemptPayload;
}

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const { auth_id, staff_id, email, password, name, role, mobile, active, staff_type } = req.body || {};

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ success: false, error: 'Server configuration error: Missing Supabase credentials' });
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const hasRawPwd = typeof password === 'string' && password.trim() !== '';
    const roleStr = String(role || '').trim().toLowerCase();
    const isStaffRole =
      staff_type === 'production' ||
      staff_type === 'operations' ||
      ['staff', 'team', 'editor', 'operation', 'production', 'sales'].some((r) => roleStr.includes(r));

    let cleanMobileStr: string | undefined = mobile ? cleanPhone(mobile) : undefined;
    let cleanEmailStr: string | undefined = email ? cleanEmail(email) : undefined;

    let resolvedStaffTable: 'production_staff' | 'operations_staff' | null =
      staff_type === 'production'
        ? 'production_staff'
        : staff_type === 'operations'
          ? 'operations_staff'
          : null;
    let existingStaffRecord: any = null;
    let staffAuthId: string | null = null;

    if (staff_id) {
      if (resolvedStaffTable === 'production_staff') {
        const { data } = await db.from('production_staff').select('*').eq('staff_id', staff_id).maybeSingle();
        if (data) existingStaffRecord = data;
      } else if (resolvedStaffTable === 'operations_staff') {
        const { data } = await db.from('operations_staff').select('*').eq('staff_id', staff_id).maybeSingle();
        if (data) existingStaffRecord = data;
      } else {
        const preferProd =
          roleStr.includes('prod') || roleStr.includes('editor') || String(staff_id).startsWith('STF-');
        const firstTable = preferProd ? 'production_staff' : 'operations_staff';
        const secondTable = preferProd ? 'operations_staff' : 'production_staff';
        const { data: firstRec } = await db.from(firstTable).select('*').eq('staff_id', staff_id).maybeSingle();
        if (firstRec) {
          existingStaffRecord = firstRec;
          resolvedStaffTable = firstTable;
        } else {
          const { data: secondRec } = await db.from(secondTable).select('*').eq('staff_id', staff_id).maybeSingle();
          if (secondRec) {
            existingStaffRecord = secondRec;
            resolvedStaffTable = secondTable;
          }
        }
      }
    } else if (resolvedStaffTable && cleanEmailStr) {
      const { data } = await db.from(resolvedStaffTable).select('*').ilike('email', cleanEmailStr).maybeSingle();
      if (data) existingStaffRecord = data;
    }

    const cleanPwd = hasRawPwd
      ? resolvedStaffTable === 'production_staff'
        ? password
        : password.trim()
      : null;

    if (cleanPwd !== null && cleanPwd.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long.' });
    }

    if (existingStaffRecord) {
      staffAuthId = existingStaffRecord.auth_user_id || parseNotesAuthId(existingStaffRecord.notes);
      if (existingStaffRecord.email) cleanEmailStr = cleanEmail(existingStaffRecord.email);
      if (existingStaffRecord.mobile) cleanMobileStr = cleanPhone(existingStaffRecord.mobile);
    }

    let targetAuthUser: any = null;
    let targetAuthId: string | null = null;

    const candidateAuthId = staffAuthId || auth_id || null;
    if (candidateAuthId) {
      targetAuthUser = await findAuthUserPaginated(db, {
        authId: candidateAuthId,
        email: cleanEmailStr || null,
        allowEmailMismatch: Boolean(staffAuthId && existingStaffRecord),
      });
      if (targetAuthUser) targetAuthId = targetAuthUser.id;
    }

    if (!targetAuthUser && cleanEmailStr) {
      try {
        const { data: uRow } = await db.from('users').select('id, email').ilike('email', cleanEmailStr).maybeSingle();
        if (uRow?.id) {
          targetAuthUser = await findAuthUserPaginated(db, { authId: uRow.id, email: cleanEmailStr });
          if (targetAuthUser) targetAuthId = targetAuthUser.id;
        }
      } catch (_) {}
    }

    if (!targetAuthUser && (cleanEmailStr || cleanMobileStr)) {
      targetAuthUser = await findAuthUserPaginated(db, {
        email: cleanEmailStr || null,
        mobile: cleanEmailStr ? null : cleanMobileStr || null,
      });
      if (targetAuthUser) targetAuthId = targetAuthUser.id;
    }

    const normalizedRole = role ? normalizeAuthRole(role, staff_type) : undefined;

    if (!targetAuthUser && cleanPwd) {
      if (!cleanEmailStr && !cleanMobileStr) {
        return res.status(404).json({ success: false, error: 'Staff authentication account not found' });
      }
      const encPwd = encryptStaffPassword(cleanPwd);
      const recovered = await createOrRecoverAuthUser(db, {
        email: cleanEmailStr,
        mobile: cleanMobileStr,
        staffId: existingStaffRecord?.staff_id || staff_id || null,
        password: cleanPwd,
        name: name || existingStaffRecord?.name || 'Staff Member',
        normalizedRole:
          normalizedRole || (resolvedStaffTable === 'production_staff' ? 'Production Team' : 'Operation Staff'),
        active,
        encPwd,
      });
      if (!recovered.user) {
        return res.status(400).json({
          success: false,
          error: recovered.error || 'Failed to update staff authentication credentials',
        });
      }
      targetAuthUser = recovered.user;
      targetAuthId = recovered.user.id;
    }

    if (cleanPwd && !targetAuthId) {
      return res.status(404).json({
        success: false,
        error: 'Could not find or create authentication account for staff member',
      });
    }

    if (targetAuthId) {
      const cleanedMeta: any = { ...(targetAuthUser?.user_metadata || {}) };
      delete cleanedMeta.current_password;
      if (name) cleanedMeta.name = name;
      if (normalizedRole) cleanedMeta.role = normalizedRole;
      if (cleanMobileStr) cleanedMeta.mobile = cleanMobileStr;
      if (cleanEmailStr && !cleanedMeta.original_email) cleanedMeta.original_email = cleanEmailStr;

      const updates: any = {
        user_metadata: cleanedMeta,
        email_confirm: true,
      };
      if (cleanPwd) {
        updates.password = cleanPwd;
        updates.app_metadata = {
          ...(targetAuthUser?.app_metadata || {}),
          enc_pwd: encryptStaffPassword(cleanPwd),
        };
      }
      if (active !== undefined) {
        updates.ban_duration = active === false ? '876000h' : 'none';
      }
      if (cleanEmailStr && !isStaffRole && cleanEmail(targetAuthUser?.email) !== cleanEmailStr) {
        updates.email = cleanEmailStr;
      }

      const { data: updData, error: authUpdErr } = await db.auth.admin.updateUserById(targetAuthId, updates);
      if (authUpdErr) {
        if (cleanPwd) {
          const recovered = await createOrRecoverAuthUser(db, {
            email: cleanEmailStr,
            mobile: cleanMobileStr,
            staffId: existingStaffRecord?.staff_id || staff_id || null,
            password: cleanPwd,
            name: name || existingStaffRecord?.name || 'Staff Member',
            normalizedRole:
              normalizedRole || (resolvedStaffTable === 'production_staff' ? 'Production Team' : 'Operation Staff'),
            active,
            encPwd: encryptStaffPassword(cleanPwd),
          });
          if (recovered.user) {
            targetAuthUser = recovered.user;
            targetAuthId = recovered.user.id;
          } else {
            return res.status(400).json({
              success: false,
              error: authUpdErr.message || 'Authentication provider failed to update password',
            });
          }
        }
      } else if (updData?.user) {
        targetAuthUser = updData.user;
      }
    }

    let syncedRecord: any = null;
    if (targetAuthId) {
      syncedRecord = await syncPublicUserRow(db, {
        authUserId: targetAuthId,
        name: name || existingStaffRecord?.name,
        email: cleanEmailStr || targetAuthUser?.email,
        mobile: cleanMobileStr,
        normalizedRole,
        active,
      });
    }

    // Sync notes.auth_user_id and Password on the resolved staff table
    if (resolvedStaffTable && (existingStaffRecord?.staff_id || staff_id)) {
      const targetRowStaffId = existingStaffRecord?.staff_id || staff_id;
      let notesObj: any = {};
      try {
        if (existingStaffRecord?.notes) {
          notesObj =
            typeof existingStaffRecord.notes === 'string'
              ? JSON.parse(existingStaffRecord.notes)
              : existingStaffRecord.notes;
        }
      } catch (_) {
        notesObj = {};
      }
      if (targetAuthId) {
        notesObj.auth_user_id = targetAuthId;
      }
      const staffUpdates: any = {
        notes: JSON.stringify(notesObj),
      };
      if (cleanPwd && resolvedStaffTable === 'production_staff') {
        staffUpdates.Password = cleanPwd;
      }
      await db.from(resolvedStaffTable).update(staffUpdates).eq('staff_id', targetRowStaffId);
    }

    return res.status(200).json({
      success: true,
      auth_user_id: targetAuthId,
      data: { user: targetAuthUser, record: syncedRecord },
    });
  } catch (err: any) {
    console.error('[Vercel Auth] Update user exception:', err);
    return res.status(500).json({ success: false, error: err.message || String(err) });
  }
}
