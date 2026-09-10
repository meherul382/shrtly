export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return res.status(401).json({ error: 'Login required.' });

  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Shrtigo backend is not configured.' });

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: serviceKey }
    });
    if (!userResponse.ok) return res.status(401).json({ error: 'Your login session has expired. Please sign in again.' });
    const user = await userResponse.json();

    res.setHeader('Set-Cookie', `shrtigo_session=${encodeURIComponent(token)}; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=Lax`);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ id: user.id, email: user.email || '', name: user.user_metadata?.full_name || user.user_metadata?.name || '' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Could not establish your dashboard session.' });
  }
}
