import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const { base64, fileName, contentType, bucketName } = req.body;
    if (!base64 || !fileName) {
      return res.status(400).json({ success: false, error: 'Missing base64 or fileName' });
    }

    const targetBucket = bucketName && typeof bucketName === 'string' && bucketName.trim() ? bucketName.trim() : 'img';
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://aqifyxsimhqayfjwzzwj.supabase.co';
    const hardcodedServiceKey = Buffer.from('c2Jfc2VjcmV0X095RGl5S2JaQmE3MGNocndYR2puTFFfM0pQWXhFanQ=', 'base64').toString('utf-8');
    const envServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const SUPABASE_SERVICE_ROLE_KEY = (envServiceKey && envServiceKey !== 'YOUR_SUPABASE_SERVICE_ROLE_KEY' && envServiceKey.trim() !== '')
      ? envServiceKey
      : hardcodedServiceKey;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ success: false, error: 'Server configuration error: Missing Supabase credentials' });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const base64Data = base64.includes(';base64,') ? base64.split(';base64,')[1] : base64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Determine MIME type
    let resolvedMime = contentType || 'image/jpeg';
    if (!contentType || contentType === 'image/jpeg') {
      if (fileName.toLowerCase().endsWith('.png') || base64.startsWith('data:image/png')) {
        resolvedMime = 'image/png';
      } else if (fileName.toLowerCase().endsWith('.webp') || base64.startsWith('data:image/webp')) {
        resolvedMime = 'image/webp';
      } else if (fileName.toLowerCase().endsWith('.gif') || base64.startsWith('data:image/gif')) {
        resolvedMime = 'image/gif';
      } else {
        resolvedMime = 'image/jpeg';
      }
    }

    // Ensure bucket exists and is public
    try {
      const { data: buckets } = await supabaseAdmin.storage.listBuckets();
      if (buckets && !buckets.some(b => b.name === targetBucket)) {
        await supabaseAdmin.storage.createBucket(targetBucket, { public: true });
      }
    } catch (bErr) {
      console.warn('[Vercel API Storage] Bucket check warning:', bErr);
    }

    const { data, error } = await supabaseAdmin.storage
      .from(targetBucket)
      .upload(fileName, buffer, {
        contentType: resolvedMime,
        upsert: true
      });

    if (error) {
      console.error('[Vercel API] Upload error:', error);
      return res.status(400).json({ success: false, error: error.message });
    }

    const { data: publicData } = supabaseAdmin.storage
      .from(targetBucket)
      .getPublicUrl(data ? data.path : fileName);

    res.status(200).json({ success: true, publicUrl: publicData.publicUrl });
  } catch (err: any) {
    console.error('[Vercel API] Upload exception:', err);
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
}
