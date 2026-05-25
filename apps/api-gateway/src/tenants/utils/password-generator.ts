import { randomBytes } from 'node:crypto';

export function generateTemporaryPassword(): string {
  const random = randomBytes(18).toString('base64url');
  return `Ts-${random}9!`;
}

