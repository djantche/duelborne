// Import d'un deck par la page Mon Deck : colle un .ydk, une YDKE ou un lien, vérifie le deck obtenu.
//   node tools/visual/deck-import.mjs [lien]   (le lien YGOProDeck demande Internet)
import { readFileSync } from 'node:fs'
import { SHOTS } from './cdp.mjs'
import { open, setup, sleep, tap } from './lib.mjs'

await setup()
const p = await open({ w: 844, h: 390, mobile: true })
const text = (sel) => p.eval(`document.querySelector(${JSON.stringify(sel)})?.innerText ?? null`)
const paste = (value) => p.eval(`(() => { const t = document.querySelector('.dk-dialog textarea'); t.value = ${JSON.stringify(value)}; t.dispatchEvent(new Event('input', { bubbles: true })) })()`)
const state = async () => ({ nom: await p.eval(`document.querySelector('input[name=deck-name]').value`), chips: (await text('.dk-top')).replace(/\n+/g, ' '), note: await text('.dk-note') })
const importer = async (label, value) => {
  await tap(p, '[data-act="deck-decks"]'); await sleep(300)
  await p.eval(`[...document.querySelectorAll('.dk-dialog .btn')].find((b) => /Importer/i.test(b.innerText)).click()`); await sleep(250)
  await paste(value)
  await p.eval(`[...document.querySelectorAll('.dk-dialog .btn')].find((b) => /^Importer$/i.test(b.innerText.trim())).click()`)
  // Un deck importé et pas encore enregistré est « modifié » : la fenêtre demande quoi en faire, on l'abandonne.
  await sleep(300)
  if (/Changements/.test((await text('.dk-dialog h2')) ?? '')) {
    await p.eval(`[...document.querySelectorAll('.dk-dialog .btn')].find((b) => /Abandonner/i.test(b.innerText)).click()`)
    await sleep(600)
  }
  for (let i = 0; i < 80 && (await p.eval(`!!document.querySelector('.dk-dialog')`)) && !(await text('.dk-dialog .dk-note')); i++) await sleep(250)
  const err = await text('.dk-dialog .dk-note')
  console.log(label, '→', err ? `ERREUR : ${err}` : JSON.stringify(await state()))
}
await p.eval(`document.querySelector('[data-act="deck"]').click()`)
await sleep(500)
await importer('.ydk du deck Yubel', readFileSync(new URL('../../decks/yubel.ydk', import.meta.url), 'utf8'))
await p.shot('import-1-ydk.png')
// Cinq exemplaires d'une carte : les copies en trop sont retirées, l'import n'échoue pas.
await importer('.ydk avec 5 copies', '#main\n' + Array.from({ length: 5 }, () => '89631139').join('\n') + '\n' + Array.from({ length: 36 }, () => '46986414').join('\n') + '\n#extra\n23995346\n')
const enc = (codes) => Buffer.from(Uint32Array.from(codes).buffer).toString('base64')
await importer('YDKE', `ygoprodeck://${enc([89631139, 89631139, 46986414, 74677422, 70781052, 17444133, 22702055, 55144522, 12580477, 24094653])}|${enc([23995346])}|`)
await importer('texte quelconque', 'bonjour je ne suis pas un deck du tout du tout')
if (process.argv[2]) await importer('lien', process.argv[2])
console.log('erreurs de la page :', p.logs.slice(0, 5))
console.log('captures dans', SHOTS)
process.exit(0)
