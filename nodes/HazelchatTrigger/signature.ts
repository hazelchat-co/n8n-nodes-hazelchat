import { createHmac, timingSafeEqual } from 'crypto';

// Hazelchat signs every delivery to n8n with the subscription's secret:
// X-Hazelchat-Signature: sha256=<hex HMAC-SHA256 of "<timestamp>.<raw body>">
// X-Hazelchat-Timestamp: <Unix seconds when the request was signed>
export const SIGNATURE_HEADER = 'x-hazelchat-signature';
export const TIMESTAMP_HEADER = 'x-hazelchat-timestamp';
// A request signed more than five minutes before or after this instance's
// clock is refused. Retries are signed afresh, so the window never blocks one.
export const TOLERANCE_SECONDS = 300;

export type Verdict =
	| { ok: true }
	| { ok: false; reason: 'no-secret' | 'malformed' | 'stale' | 'mismatch' };

export function verifySignature(input: {
	secret: unknown;
	rawBody: unknown;
	timestamp: unknown;
	signature: unknown;
	now: number;
}): Verdict {
	const { secret, rawBody, timestamp, signature, now } = input;
	if (typeof secret !== 'string' || !/^hzs_[0-9a-f]{64}$/.test(secret)) {
		return { ok: false, reason: 'no-secret' };
	}
	const body = Buffer.isBuffer(rawBody)
		? rawBody
		: typeof rawBody === 'string'
			? Buffer.from(rawBody, 'utf8')
			: undefined;
	if (
		!body ||
		typeof timestamp !== 'string' ||
		!/^\d{1,12}$/.test(timestamp) ||
		typeof signature !== 'string'
	) {
		return { ok: false, reason: 'malformed' };
	}
	const given = /^sha256=([0-9a-f]{64})$/.exec(signature);
	if (!given) return { ok: false, reason: 'malformed' };
	if (Math.abs(now / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) {
		return { ok: false, reason: 'stale' };
	}
	const expected = createHmac('sha256', secret)
		.update(timestamp + '.')
		.update(body)
		.digest();
	return timingSafeEqual(expected, Buffer.from(given[1], 'hex'))
		? { ok: true }
		: { ok: false, reason: 'mismatch' };
}
