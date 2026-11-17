import { clearManagerSessionCookie } from '../_authHelpers';

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  clearManagerSessionCookie(req, res);
  return res.status(200).json({ success: true });
}
