import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const SALT_ROUNDS = 10;

export function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/**
 * Verifies a Django `pbkdf2_sha256$<iterations>$<salt>$<b64 hash>` password, so
 * accounts created by the previous backend can still sign in. New passwords are
 * always stored as bcrypt.
 */
function verifyDjangoPbkdf2(plain, encoded) {
  const [algorithm, iterations, salt, expected] = encoded.split('$');
  if (algorithm !== 'pbkdf2_sha256' || !iterations || !salt || !expected) return false;

  const derived = crypto
    .pbkdf2Sync(plain, salt, Number.parseInt(iterations, 10), 32, 'sha256')
    .toString('base64');
  const a = Buffer.from(derived);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function comparePassword(plain, hash) {
  if (!plain || !hash) return false;
  if (hash.startsWith('pbkdf2_sha256$')) return verifyDjangoPbkdf2(plain, hash);
  return bcrypt.compare(plain, hash);
}

/** True when the stored hash should be upgraded to bcrypt on next login. */
export function needsRehash(hash) {
  return typeof hash === 'string' && hash.startsWith('pbkdf2_sha256$');
}
