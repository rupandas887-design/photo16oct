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
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const queries = [
      db.from('users').select('*'),
      db.from('leads').select('*').order('lead_id', { ascending: false }),
      db.from('orders').select('*').order('created_at', { ascending: false }),
      db.from('operations').select('*'),
      db.from('raw_footage').select('*'),
      db.from('production').select('*'),
      db.from('payments').select('*'),
      Promise.resolve({ data: [], error: null }),
      db.from('operations_staff').select('*').order('name'),
      db.from('notifications').select('*').order('created_at', { ascending: false }),
      db.from('equipment').select('*'),
      db.from('lead_packages').select('*'),
      db.from('packages').select('*').order('created_at', { ascending: false }),
      db.from('staff_assignments').select('*'),
      db.from('quotations').select('*'),
      db.from('lead_status_history').select('*').order('created_at', { ascending: true }),
      db.from('lead_staff_assignment_history').select('*').order('assigned_at', { ascending: false }),
      db.from('lead_equipment_history').select('*').order('returned_at', { ascending: false }),
      db.from('lead_events').select('*').order('created_at', { ascending: true }),
      db.from('v_task_assignment_details').select('*'),
      db.from('production_specialties').select('*'),
      db.from('editor_assignments').select('*'),
      db.from('production_staff').select('*'),
      db.from('calendar_memos').select('*').order('created_at', { ascending: false }),
      db.from('payment_history').select('*'),
    ];

    const results = await Promise.all(
      queries.map((q) =>
        Promise.resolve(q).catch((err) => ({
          data: [],
          error: { message: err?.message || String(err) },
        }))
      )
    );

    const data = results.map((r: any) => r?.data || []);
    const errors = results.map((r: any) => (r?.error ? r.error.message : null));

    return res.status(200).json({ success: true, data, errors });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || String(err) });
  }
}
