/* ==========================================================================
   LADDER PAYOUTS — the 50% overtake revenue share.
   GET  /api/ladder-payout?code=XXXX-XXXX        (or ?email=…&prove_name=…)
        → { owed_total, payouts[], receipt }
          receipt = proof of the spot you owned/held (what you paid, when,
          payment ref) — you need it (your edit code) to claim the money.
   POST /api/ladder-payout  { code|email+prove_name, destination }
        → { claimed_total }  — marks every 'owed' payout as 'claimed' with
          the payout destination; ops completes the Bachs transfer (→ 'paid').
   ========================================================================== */
const getSupabase = require('../lib/supabase.js');
const { cleanText, isEmail, originAllowed } = require('../lib/validate.js');
const { hashEditCode, looksLikeEditCode } = require('../lib/editcode.js');

async function authTarget(supa, body, query) {
  const code = String((body && body.code) || (query && query.code) || '').trim();
  if (code) {
    if (!looksLikeEditCode(code)) return { err: 400, error: 'An edit code looks like K7PM-X2QF.' };
    const { data: byCode } = await supa
      .from('claims').select('id,name,status,checkout_id,created_at')
      .eq('edit_code_hash', hashEditCode(code))
      .in('status', ['paid', 'free'])
      .limit(1).maybeSingle();
    if (!byCode) return { err: 401, error: 'That edit code doesn’t match any spot.' };
    return { target: byCode };
  }
  const email = String((body && body.email) || (query && query.email) || '').trim().toLowerCase();
  if (!email || !isEmail(email)) return { err: 400, error: 'Edit code or claim email required.' };
  const { data: claims } = await supa
    .from('claims').select('id,name,status,checkout_id,created_at')
    .ilike('email', email)
    .in('status', ['paid', 'free'])
    .order('created_at', { ascending: false });
  if (!claims || !claims.length) return { err: 404, error: 'No turf found for that email.' };
  const proveName = cleanText((body && body.prove_name) || (query && query.prove_name) || '', 64);
  const match = claims.find(c => proveName && proveName.toLowerCase() === String(c.name || '').toLowerCase());
  if (!match) return { err: 401, error: 'Enter the name on the claim to confirm it’s yours.' };
  return { target: match };
}

exports.default = async (req, res) => {
  try {
    if (req.method !== 'GET' && !originAllowed(req)) {
      return res.status(403).json({ error: 'Cross-origin payout calls are not allowed.' });
    }
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' });
    const supa = getSupabase();

    const auth = await authTarget(supa, req.body || {}, req.query || {});
    if (auth.err) return res.status(auth.err).json({ error: auth.error });
    const target = auth.target;

    /* every payout row for this claim, newest first */
    const { data: payouts, error: pErr } = await supa
      .from('ladder_payouts')
      .select('amount_ngn,status,ref,destination,created_at,claimed_at')
      .eq('claim_id', target.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (pErr) throw pErr;
    const rows = payouts || [];
    const owed = rows.filter(p => p.status === 'owed');

    /* ---------------- GET: earnings + the receipt ---------------- */
    if (req.method === 'GET') {
      let paidAmount = 0;
      let paidAt = target.created_at;
      try {
        const { data: entry } = await supa
          .from('ladder_entries').select('amount,paid_at').eq('claim_id', target.id).limit(1).maybeSingle();
        if (entry) { paidAmount = Number(entry.amount) || 0; paidAt = entry.paid_at || paidAt; }
      } catch (e) { /* entry gone (overtaken off?) — fall back to claim date */ }
      const refRaw = String(target.checkout_id || '');
      return res.status(200).json({
        owed_total: owed.reduce((a, p) => a + (Number(p.amount_ngn) || 0), 0),
        payouts: rows.map(p => ({
          amount_ngn: Number(p.amount_ngn) || 0,
          status: p.status,
          ref: '…' + String(p.ref || '').slice(-8).toUpperCase(),
          created_at: p.created_at,
        })),
        receipt: {
          name: target.name,
          paid: paidAmount,
          date: paidAt,
          ref: refRaw ? '…' + refRaw.slice(-8).toUpperCase() : 'FOUNDER-FREE',
        },
      });
    }

    /* ---------------- POST: claim the money ---------------- */
    const destination = cleanText(req.body.destination, 120).toLowerCase();
    if (!isEmail(destination)) return res.status(400).json({ error: 'Enter the email the money should land in.' });
    if (!owed.length) return res.status(409).json({ error: 'Nothing to claim yet — you get 50% when someone overtakes you.' });

    const { data: claimed, error: upErr } = await supa
      .from('ladder_payouts')
      .update({ status: 'claimed', destination, claimed_at: new Date().toISOString() })
      .eq('claim_id', target.id)
      .eq('status', 'owed')
      .select('amount_ngn');
    if (upErr) throw upErr;
    const total = (claimed || []).reduce((a, p) => a + (Number(p.amount_ngn) || 0), 0);
    return res.status(200).json({ ok: true, claimed_total: total, destination });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
