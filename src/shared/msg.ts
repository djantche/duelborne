// Messages du serveur destinés à être lus par les joueurs : le serveur n'écrit pas de phrases, il envoie une RÉFÉRENCE que
// chaque client traduit dans sa langue (fichiers src/client/locales). Une référence est une chaîne : « @clé » ou
// « @clé|{"paramètre":valeur} ». Cas particulier « @= » : un texte du moteur, tel que les données le donnent en français
// et en anglais (« @=|{"fr":"…","en":"…"} »).
export type MsgParams = Record<string, string | number>

/** Référence à un texte traduit du client. */
export const msg = (key: string, params?: MsgParams): string => `@${key}${params && Object.keys(params).length ? `|${JSON.stringify(params)}` : ''}`

/** Texte du moteur de règles, en français et en anglais (l'anglais manque parfois : le français sert alors). */
export const raw = (fr: string, en?: string | null): string => `@=|${JSON.stringify({ fr, en: en || fr })}`

/** Lit une référence ; null si la chaîne est un texte ordinaire. */
export function parseMsg(s: string): { key: string; params: MsgParams } | null {
  if (!s.startsWith('@')) return null
  const bar = s.indexOf('|')
  if (bar < 0) return { key: s.slice(1), params: {} }
  try {
    return { key: s.slice(1, bar), params: JSON.parse(s.slice(bar + 1)) as MsgParams }
  } catch {
    return null
  }
}

/** Le texte français d'une référence « @= » (ou le texte lui-même) : pour les tests et les journaux du serveur. */
export function frText(s: string): string {
  const m = parseMsg(s)
  return m?.key === '=' ? String(m.params.fr ?? '') : s
}
