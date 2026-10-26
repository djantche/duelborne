// Recoupe les listes de formats installées (src/server/formats/lists/) avec l'instantané indépendant de YGOPRODeck (data/raw/cards.en.json) :
// cartes identiques, cartes présentes d'un seul côté, niveaux différents, codes inconnus de la base, et pour le GOAT la cohérence de la réserve.
// Les deux sources ne sont pas datées de la même façon : un écart n'est pas forcément une erreur, c'est ce qu'il faut regarder à la main.
//
//   node tools/formats/compare-lists.ts
import { readFileSync } from 'node:fs'
const R = new URL('../../', import.meta.url).pathname
const { loadData, displayId, cardNameEn, cardData } = await import(R + 'src/server/ocg/data.ts')
loadData()
const raw = JSON.parse(readFileSync(R + 'data/raw/cards.en.json', 'utf8')).data as { id: number; name: string; banlist_info?: Record<string, string> }[]
const LIMIT: Record<string, number> = { Forbidden: 0, Limited: 1, 'Semi-Limited': 2 }
const norm = (m: Record<string, number>): Map<number, number> => new Map(Object.entries(m).map(([c, n]) => [displayId(Number(c)), n]))
for (const [id, field] of [['tcg', 'ban_tcg'], ['ocg', 'ban_ocg'], ['goat', 'ban_goat']] as const) {
  const file = JSON.parse(readFileSync(R + `src/server/formats/lists/${id}.json`, 'utf8')) as { version: string; limits: Record<string, number>; pool?: number[] }
  const a = norm(file.limits)
  const ygo = new Map<number, number>()
  for (const c of raw) { const s = c.banlist_info?.[field]; if (s && s in LIMIT) ygo.set(displayId(c.id), LIMIT[s]!) }
  const onlyA = [...a].filter(([c]) => !ygo.has(c)), onlyB = [...ygo].filter(([c]) => !a.has(c)), diff = [...a].filter(([c, n]) => ygo.has(c) && ygo.get(c) !== n)
  const unknown = Object.keys(file.limits).filter((c) => !cardData(Number(c)))
  const sum = (m: Map<number, number>, n: number): number => [...m.values()].filter((v) => v === n).length
  console.log(`\n== ${id.toUpperCase()} ${file.version} — EDOPro: ${a.size} (${sum(a, 0)} interdites, ${sum(a, 1)} limitées, ${sum(a, 2)} semi) | YGOPRODeck: ${ygo.size} (${sum(ygo, 0)}/${sum(ygo, 1)}/${sum(ygo, 2)})`)
  console.log(`   communes et identiques : ${[...a].filter(([c, n]) => ygo.get(c) === n).length} | seulement EDOPro : ${onlyA.length} | seulement YGOPRODeck : ${onlyB.length} | niveau différent : ${diff.length} | codes inconnus de la base : ${unknown.length}`)
  const show = (label: string, list: [number, number][]): void => { if (list.length) console.log(`   ${label}: ` + list.slice(0, 40).map(([c, n]) => `${cardNameEn(c)} (${n})`).join(' ; ') + (list.length > 40 ? ` … +${list.length - 40}` : '')) }
  show('seulement EDOPro', onlyA); show('seulement YGOPRODeck', onlyB)
  if (diff.length) console.log('   niveau différent: ' + diff.slice(0, 30).map(([c, n]) => `${cardNameEn(c)} EDOPro ${n} / YGO ${ygo.get(c)}`).join(' ; '))
  if (unknown.length) console.log('   inconnus: ' + unknown.slice(0, 15).join(', '))
  if (file.pool) {
    const poolIds = new Set(file.pool.map(displayId))
    const missingInDb = file.pool.filter((c) => !cardData(c))
    console.log(`   réserve : ${file.pool.length} codes → ${poolIds.size} cartes distinctes ; absents de la base : ${missingInDb.length}`)
    // Les cartes limitées par la liste doivent être dans la réserve (sauf interdites)
    const notIn = [...a].filter(([c, n]) => n > 0 && !poolIds.has(c))
    console.log(`   cartes limitées/semi hors réserve : ${notIn.length}${notIn.length ? ' → ' + notIn.slice(0, 10).map(([c]) => cardNameEn(c)).join(', ') : ''}`)
  }
}
