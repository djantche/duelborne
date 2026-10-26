// Page Mon Deck : cherche des cartes, en pose, ouvre une fiche, enregistre, rouvre.
//   node tools/visual/deck.mjs [largeur] [hauteur] [desktop|mobile]
import { SHOTS } from './cdp.mjs'
import { open, setup, sleep, tap } from './lib.mjs'

const [W, H, MOBILE] = [Number(process.argv[2] ?? 844), Number(process.argv[3] ?? 390), process.argv[4] !== 'desktop']
const tag = `${MOBILE ? 'm' : 'd'}${W}x${H}`
await setup()
const p = await open({ w: W, h: H, mobile: MOBILE })
const shot = (n) => p.shot(`deck-${tag}-${n}.png`)
const text = (sel) => p.eval(`document.querySelector(${JSON.stringify(sel)})?.innerText ?? null`)
const type = (name, value) => p.eval(`(() => { const i = document.querySelector('input[name=${name}]'); i.value = ${JSON.stringify(value)}; i.dispatchEvent(new Event('input', { bubbles: true })) })()`)

// Brouillon de la séance précédente (profil Chrome partagé) : on repart d'une page vide.
await p.eval(`localStorage.removeItem('deck-workspace-v1'); sessionStorage.removeItem('deck-workspace-v1'); location.hash = '#deck'; location.reload()`); await sleep(1500)
for (let i = 0; i < 40 && !(await p.eval(`!!document.querySelector('.dk')`)); i++) await sleep(150)
await p.eval(`document.querySelector('.dk-kind')?.click()`); await sleep(200)
await shot('1-vide')
// Les cartes se chargent après la page : on retape la recherche jusqu'à voir des résultats.
for (let i = 0; i < 60 && !(await p.eval(`!!document.querySelector('.dk-row')`)); i++) { await type('q', 'dragon blanc'); await sleep(300) }
await shot('2-recherche')
// ajoute les trois premiers résultats, deux fois pour le premier
for (const n of [0, 0, 1, 2]) { await p.eval(`document.querySelectorAll('.dk-row .dk-qty .btn:last-child')[${n}].click()`); await sleep(80) }
await shot('3-ajout')
await type('q', ''); await tap(p, '.dk-kind:nth-child(4)'); await sleep(300)
await shot('4-pieges')
await p.eval(`document.querySelector('.dk-row-main').click()`); await sleep(300)
await shot('5-fiche')
await p.eval(`document.querySelector('.dk-overlay .dk-x, .dk-overlay [data-act="sheet-close"]')?.click() ?? document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await sleep(200)
if (await p.eval(`!!document.querySelector('.dk-nav') && getComputedStyle(document.querySelector('.dk-nav')).display !== 'none'`)) await tap(p, '.dk-nav button:last-child')
await sleep(300)
await shot('6-deck')
await type('deck-name', 'Essai visuel'); await tap(p, '[data-act="deck-save"]'); await sleep(800)
await shot('7-enregistre')
console.log('note :', await text('.dk-note'), '| chips :', await text('.dk-top'))
await tap(p, '[data-act="deck-decks"]'); await sleep(500)
await shot('8-decks')
// Partir d'un deck du jeu : copie complète, jouable, puis enregistrée sous un autre nom.
await p.eval(`[...document.querySelectorAll('.dk-seg button')].at(-1).click()`); await sleep(300)
await p.eval(`document.querySelector('.dk-tiles .dk-pick').click()`); await sleep(700)
console.log('copie ouverte :', await p.eval(`document.querySelector('input[name=deck-name]').value`), '|', (await text('.dk-status')).replace(/\n/g, ' '))
await shot('9-copie')
await type('deck-name', 'Copie visuelle'); await tap(p, '[data-act="deck-save"]'); await sleep(900)
console.log('enregistrement :', await text('.dk-note'))
// Le deck apparaît-il dans la liste des salles ?
console.log('dans les salles :', await p.eval(`(async () => (await (await import('/app/store.ts')).store.decks.map((d) => d.id)).filter((id) => id.startsWith('user-')).join(','))()`))
// Changer puis quitter : la fenêtre de confirmation demande quoi faire.
await type('deck-name', 'Copie modifiée')
await tap(p, '[data-act="deck-back"]'); await sleep(400)
await shot('10-quitter')
console.log('fenêtre :', (await text('.dk-dialog h2')))
await p.eval(`[...document.querySelectorAll('.dk-dialog .btn')].find((b) => /Rester/i.test(b.innerText)).click()`); await sleep(300)
// Export
await tap(p, '[data-act="deck-decks"]'); await sleep(300)
await p.eval(`[...document.querySelectorAll('.dk-dialog .btn')].find((b) => /Exporter/i.test(b.innerText)).click()`); await sleep(300)
await shot('11-export')
console.log('export :', (await p.eval(`document.querySelector('.dk-dialog textarea').value.split('\\n').slice(0, 4).join(' | ')`)))
await p.eval(`document.querySelector('.dk-dialog header .btn').click()`); await sleep(200)
// Suppression de la copie enregistrée
await tap(p, '[data-act="deck-decks"]'); await sleep(300)
await p.eval(`document.querySelector('.dk-tiles .dk-del')?.click()`); await sleep(300)
await shot('12-supprimer')
await tap(p, '[data-act="deck-remove"]'); await sleep(600)
console.log('mes decks après suppression :', await p.eval(`document.querySelectorAll('.dk-tiles .dk-tilecard').length`))
console.log('erreurs de la page :', p.logs.slice(0, 5))
console.log('captures dans', SHOTS)
process.exit(0)
