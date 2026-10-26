import { saved } from './store.ts'

let key: string | null = null
let persistent = true

/** Secret privé de cette installation et de cette origine, jamais un identifiant public de joueur. */
export function guestKey(): string {
  if (key) return key
  const previous = saved.get('guest-key')
  if (previous && /^[a-f0-9]{64}$/.test(previous)) return (key = previous)
  key = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('')
  try { localStorage.setItem('guest-key', key) } catch { persistent = false }
  return key
}

export function guestStorageAvailable(): boolean { guestKey(); return persistent }
