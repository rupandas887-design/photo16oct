const MANAGER_SESSION_COOKIE = 'erp_manager_session';

const isHttpsRequest = (req: any): boolean => {
  if (req?.secure) return true;
  const proto = String(req?.headers?.['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  return proto === 'https';
};

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  const isHttps = isHttpsRequest(req);
  const cookieParts = [
    `${MANAGER_SESSION_COOKIE}=`,
    'Path=/',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'HttpOnly',
    isHttps ? 'Secure' : '',
    `SameSite=${isHttps ? 'None' : 'Lax'}`,
  ].filter(Boolean);
  res.setHeader('Set-Cookie', cookieParts.join('; '));
  return res.status(200).json({ success: true });
}
