import { createClient } from '@supabase/supabase-js';

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

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const { identifier } = req.body || {};
    const cleanInput = String(identifier ?? '').trim();
    if (!cleanInput) {
      return res.status(200).json({ success: true, emails: [] });
    }
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const lowerInput = cleanInput.toLowerCase();
    const digits = cleanInput.replace(/\D/g, '');
    const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
    const isPhone = !cleanInput.includes('@') && digits.length >= 7 && !/^0+$/.test(digits);

    const parseNotesAuthId = (notesVal: any): string | null => {
      if (!notesVal) return null;
      try {
        let parsed = typeof notesVal === 'string' ? JSON.parse(notesVal) : notesVal;
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        if (parsed?.auth_user_id) return String(parsed.auth_user_id).trim();
      } catch (_) {}
      return null;
    };

    const getAliasTerms = (val: string): string[] => {
      const v = val.trim().toLowerCase();
      if (v === 'owner@photocrew.com' || v === 'founder@photocrew.com' || v === 'owner' || v === 'founder') {
        return [v, 'owner@photocrew.com', 'founder@photocrew.com', 'owner'];
      }
      if (v === 'operation@photocrew.com' || v === 'operations@photocrew.com' || v === 'operation' || v === 'operations') {
        return [v, 'operation@photocrew.com', 'operations@photocrew.com', 'operation'];
      }
      if (v === 'production@photocrew.com' || v === 'production') {
        return [v, 'production@photocrew.com', 'production'];
      }
      if (v === 'sales@photocrew.com' || v === 'sale@photocrew.com') {
        return [v, 'sales@photocrew.com', 'sale@photocrew.com'];
      }
      return [v];
    };
    const aliasSet = new Set<string>(getAliasTerms(lowerInput));

    const matchesRow = (r: any) => {
      if (!r) return false;
      const rEmail = String(r.email ?? '').trim().toLowerCase();
      const rUser = String(r.username ?? '').trim().toLowerCase();
      if (rEmail && aliasSet.has(rEmail)) return true;
      if (rUser && aliasSet.has(rUser)) return true;
      if (isPhone) {
        const rMob = String(r.mobile ?? r.mobile_number ?? '').replace(/\D/g, '');
        const rWa = String(r.whatsapp_number ?? '').replace(/\D/g, '');
        const rMob10 = rMob.length >= 10 ? rMob.slice(-10) : rMob;
        const rWa10 = rWa.length >= 10 ? rWa.slice(-10) : rWa;
        if (rMob && !/^0+$/.test(rMob) && (rMob === digits || (last10.length >= 7 && rMob10 === last10))) return true;
        if (rWa && !/^0+$/.test(rWa) && (rWa === digits || (last10.length >= 7 && rWa10 === last10))) return true;
      }
      return false;
    };

    const [prodRes, opRes, usersRes] = await Promise.all([
      db.from('production_staff').select('staff_id, email, mobile, whatsapp_number, notes'),
      db.from('operations_staff').select('staff_id, email, mobile, whatsapp_number, notes'),
      db.from('users').select('id, email, username, mobile'),
    ]);

    const candidateAuthIds = new Set<string>();
    const candidateEmails = new Set<string>();

    for (const ps of prodRes.data || []) {
      if (matchesRow(ps)) {
        const aid = parseNotesAuthId(ps.notes);
        if (aid) candidateAuthIds.add(aid);
        if (ps.email && String(ps.email).includes('@')) candidateEmails.add(String(ps.email).trim().toLowerCase());
      }
    }
    for (const os of opRes.data || []) {
      if (matchesRow(os)) {
        const aid = parseNotesAuthId(os.notes);
        if (aid) candidateAuthIds.add(aid);
        if (os.email && String(os.email).includes('@')) candidateEmails.add(String(os.email).trim().toLowerCase());
      }
    }
    for (const u of usersRes.data || []) {
      if (matchesRow(u)) {
        if (u.id) candidateAuthIds.add(String(u.id).trim());
        if (u.email && String(u.email).includes('@')) candidateEmails.add(String(u.email).trim().toLowerCase());
      }
    }

    const resolvedEmails = new Set<string>();
    if (db.auth && db.auth.admin) {
      for (const aid of candidateAuthIds) {
        try {
          const { data: gu } = await db.auth.admin.getUserById(aid);
          const authEm = gu?.user?.email ? String(gu.user.email).trim().toLowerCase() : '';
          if (authEm && authEm.includes('@')) resolvedEmails.add(authEm);
        } catch (_) {}
      }
    }
    for (const em of candidateEmails) {
      resolvedEmails.add(em);
    }

    return res.status(200).json({ success: true, emails: Array.from(resolvedEmails) });
  } catch (_) {
    return res.status(200).json({ success: true, emails: [] });
  }
}
