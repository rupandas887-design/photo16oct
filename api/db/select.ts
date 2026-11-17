import { getServerSupabase } from '../_authHelpers';

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const { table, matchColumn, matchValue, columns = '*' } = req.body || {};
    if (!table) {
      return res.status(400).json({ success: false, error: 'Missing table' });
    }
    const db = getServerSupabase();
    let query = db.from(table).select(columns);
    if (matchColumn && matchValue !== undefined) {
      query = query.eq(matchColumn, matchValue);
    }
    const { data, error } = await query;
    if (error) {
      return res.status(400).json({ success: false, error: error.message, details: error });
    }
    return res.status(200).json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || String(err) });
  }
}
