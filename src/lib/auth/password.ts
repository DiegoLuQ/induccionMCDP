import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashSecret(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifySecret(
  plain: string,
  hash: string | null | undefined,
): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}
