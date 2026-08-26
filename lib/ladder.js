/* ==========================================================================
   LADDER CORE — one source of truth for the ranking/pricing rules.
   Product decisions (2026-08-26):
     • RANK = sorted by amount paid (desc). Ties: earlier payment ranks higher.
       Nobody holds a fixed slot — if someone pays more, they rank above you
       and you slide to wherever YOUR paid amount belongs. Impartial by design.
     • First payer ever defaults to #1 (₦100) — only until outbid.
     • Entry ("join"): pay anything ≥ ₦100. Rank emerges from the price.
     • Overtake a specific holder: pay 2× their amount → you land above them.
     • While someone is paying to overtake a holder, that holder is LOCKED
       for 15 minutes (advisory UX lock; placement itself is race-free).
   ========================================================================== */

const BASE_PRICE = Number(process.env.LADDER_BASE_PRICE || 100);   /* NGN minimum */
const OVERTAKE_MULTIPLE = 2;
const LOCK_MINUTES = 15;
const ROW_SIZE = 20;
const MAX_AMOUNT = 10_000_000; /* ₦10M sanity cap per payment */

function basePrice() { return BASE_PRICE; }
function overtakePrice(holderPaid) { return OVERTAKE_MULTIPLE * Math.max(BASE_PRICE, Number(holderPaid) || 0); }
function lockUntilMs(nowMs) { return (nowMs || Date.now()) + LOCK_MINUTES * 60 * 1000; }

/* Valid join amount: whole naira, [100 .. 10M] */
function validAmount(a) {
  const n = Math.round(Number(a));
  return Number.isFinite(n) && n >= BASE_PRICE && n <= MAX_AMOUNT;
}

/* Where a payment of `amount` would land right now, given entries sorted
   desc by amount (ties: earlier first). Returns 1-based predicted rank. */
function previewRank(entries, amount, nowMs) {
  const now = nowMs || Date.now();
  let rank = 1;
  for (const e of entries) {
    if (Number(e.amount) > amount || (Number(e.amount) === amount && new Date(e.paid_at).getTime() < now)) {
      rank++;
    }
  }
  return rank;
}

module.exports = {
  BASE_PRICE, OVERTAKE_MULTIPLE, LOCK_MINUTES, ROW_SIZE, MAX_AMOUNT,
  basePrice, overtakePrice, lockUntilMs, validAmount, previewRank,
};
