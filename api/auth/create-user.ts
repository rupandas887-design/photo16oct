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
  opts: { email?: string | null; mobile?: string | null }
): Promise<any | null> {
  const targetEmail = cleanEmail(opts.email);
  const targetMobile = cleanPhone(opts.mobile);

  if (targetEmail) {
    try {
      const { data: uRow } = await db.from('users').select('id').ilike('email', targetEmail).maybeSingle();
      if (uRow?.id) {
        const { data: byIdData, error: byIdErr } = await db.auth.admin.getUserById(uRow.id);
        if (!byIdErr && byIdData?.user) return byIdData.user;
      }
    } catch (_) {}
  }

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

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const { staff_id, staff_type, email, password, name, role, mobile, active = true } = req.body || {};

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ success: false, error: 'Server configuration error: Missing Supabase credentials' });
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const cleanEmailStr = cleanEmail(email);
    const cleanMobileStr = cleanPhone(mobile);
    const primaryEmail = cleanEmailStr || `${cleanMobileStr || 'staff'}@photocrew.com`;
    const normalizedRole = normalizeAuthRole(role, staff_type);
    const isProdStaff =
      staff_type === 'production' ||
      normalizedRole === 'Production Team' ||
      String(staff_id || '').startsWith('STF-');

    const rawPwd = typeof password === 'string' && password.trim() !== ''
      ? (isProdStaff ? password : password.trim())
      : `${cleanMobileStr || 'staff'}@123`;

    if (rawPwd.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long.' });
    }

    const encPwd = encryptStaffPassword(rawPwd);
    const baseUserMeta = {
      name: name || 'Staff Member',
      role: normalizedRole,
      mobile: cleanMobileStr || '',
      ...(cleanEmailStr ? { original_email: cleanEmailStr } : {}),
    };

    let authUser: any = null;
    const { data, error } = await db.auth.admin.createUser({
      email: primaryEmail,
      password: rawPwd,
      email_confirm: true,
      ...(active === false ? { ban_duration: '876000h' } : {}),
      user_metadata: baseUserMeta,
      app_metadata: { enc_pwd: encPwd },
    });

    if (!error && data?.user) {
      authUser = data.user;
    } else {
      const existingAuth = await findAuthUserPaginated(db, {
        email: primaryEmail,
        mobile: cleanMobileStr || null,
      });
      if (existingAuth) {
        const cleanedMeta = { ...(existingAuth.user_metadata || {}), ...baseUserMeta };
        delete cleanedMeta.current_password;
        const { data: updData } = await db.auth.admin.updateUserById(existingAuth.id, {
          password: rawPwd,
          email_confirm: true,
          ...(active !== undefined ? { ban_duration: active === false ? '876000h' : 'none' } : {}),
          user_metadata: cleanedMeta,
          app_metadata: { ...(existingAuth.app_metadata || {}), enc_pwd: encPwd },
        });
        authUser = updData?.user || existingAuth;
      } else {
        const staffSlug = String(staff_id || cleanMobileStr || Date.now())
          .replace(/[^a-zA-Z0-9]/g, '')
          .toLowerCase();
        const aliasEmail = `staff.${staffSlug}@photocrew.com`;
        const { data: aliasCreated, error: aliasErr } = await db.auth.admin.createUser({
          email: aliasEmail,
          password: rawPwd,
          email_confirm: true,
          ...(active === false ? { ban_duration: '876000h' } : {}),
          user_metadata: baseUserMeta,
          app_metadata: { enc_pwd: encPwd },
        });
        if (!aliasErr && aliasCreated?.user) {
          authUser = aliasCreated.user;
        }
      }
    }

    if (!authUser?.id) {
      return res.status(400).json({
        success: false,
        error: error?.message || 'Failed to create staff authentication account',
      });
    }

    const userRecord: any = {
      id: authUser.id,
      name: name || 'Staff Member',
      email: primaryEmail,
      username: primaryEmail,
      mobile: cleanMobileStr || '0000000000',
      role: normalizedRole,
      active: active !== false,
      password: null,
      created_at: new Date().toISOString(),
    };

    const { error: dbError } = await db.from('users').upsert(userRecord, { onConflict: 'id' });
    if (dbError && dbError.message?.includes('username')) {
      delete userRecord.username;
      await db.from('users').upsert(userRecord, { onConflict: 'id' });
    }

    // Persist auth_user_id (and Password for production_staff) onto the staff table row
    const targetTable = isProdStaff ? 'production_staff' : 'operations_staff';
    if (staff_id || cleanEmailStr) {
      try {
        let q = db.from(targetTable).select('staff_id, notes');
        if (staff_id) q = q.eq('staff_id', staff_id);
        else q = q.ilike('email', cleanEmailStr);
        const { data: rows } = await q;
        for (const r of rows || []) {
          let notesObj: any = {};
          try {
            if (r.notes) notesObj = typeof r.notes === 'string' ? JSON.parse(r.notes) : r.notes;
          } catch (_) {}
          notesObj.auth_user_id = authUser.id;
          const staffUpd: any = { notes: JSON.stringify(notesObj) };
          if (targetTable === 'production_staff') {
            staffUpd.Password = rawPwd;
          }
          await db.from(targetTable).update(staffUpd).eq('staff_id', r.staff_id);
        }
      } catch (_) {}
    }

    return res.status(200).json({
      success: true,
      auth_user_id: authUser.id,
      data: { user: authUser, record: userRecord },
    });
  } catch (err: any) {
    console.error('[Vercel Auth] Create user exception:', err);
    return res.status(500).json({ success: false, error: err.message || String(err) });
  }
}
