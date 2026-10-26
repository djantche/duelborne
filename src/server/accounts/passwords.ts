// Mots de passe : jamais gardés, seulement leur empreinte scrypt (algorithme de dérivation lent, avec sel aléatoire).
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'

const N = 16384
const R = 8
const P = 1
const KEY_LENGTH = 64
const MAX_MEM = 64 * 1024 * 1024

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password.normalize('NFKC'), salt, KEY_LENGTH, { N: n, r, p, maxmem: MAX_MEM }, (err, key) => (err ? reject(err) : resolve(key)))
  })
}

/** Empreinte au format « scrypt$N$r$p$sel$empreinte » : les paramètres voyagent avec elle, ils pourront évoluer. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await derive(password, salt, N, R, P)
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, n, r, p, salt, hash] = stored.split('$')
  if (kind !== 'scrypt' || !n || !r || !p || !salt || !hash) return false
  try {
    const expected = Buffer.from(hash, 'base64')
    const key = await derive(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p))
    return key.length === expected.length && timingSafeEqual(key, expected)
  } catch {
    return false
  }
}

/** Empreinte d'un mot de passe qui n'existe pas : pour que « compte inconnu » prenne le même temps que « mauvais mot de passe ». */
let decoy: Promise<string> | null = null
export const decoyHash = (): Promise<string> => (decoy ??= hashPassword(randomBytes(12).toString('hex')))
