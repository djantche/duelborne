import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatDesc } from './cardview.ts'

const blocks = (html: string): string[] => html.match(/<div class="eff-block[^\"]*">[\s\S]*?<\/div>/g) ?? []
const active = (html: string): string[] => blocks(html).filter((b) => b.includes('eff-on'))

test('sépare les effets non numérotés sans compter les matériaux ni les effets continus', () => {
  const text = '1 Syntoniseur + 1+ monstre non-Syntoniseur\nAucun joueur ne peut Invoquer Spécialement min. 2 monstres en même temps. Une fois par tour (Effet Rapide) : vous pouvez annuler l’activation. (Effet Rapide) : vous pouvez Sacrifier cette carte ; Invoquez Spécialement 1 monstre. Vous ne pouvez utiliser cet effet qu’une fois par tour.'
  const html = formatDesc(text, 2)
  assert.equal(blocks(html).length, 4)
  assert.equal(active(html).length, 1)
  assert.match(active(html)[0]!, /Sacrifier/)
  assert.match(active(html)[0]!, /Vous ne pouvez utiliser/)
  assert.doesNotMatch(active(html)[0]!, /annuler/)
})

test('garde les puces et la limite de Floraison de Cendres dans le même effet actif', () => {
  const text = 'Lorsqu’un effet est activé (Effet Rapide) : défaussez cette carte ; annulez cet effet.\n●Ajouter une carte depuis le Deck à la main.\n●Invoquer Spécialement depuis le Deck.\n●Envoyer une carte depuis le Deck au Cimetière.\nVous ne pouvez utiliser cet effet qu’une fois par tour.'
  const html = formatDesc(text, 1)
  assert.equal(active(html).length, 1)
  assert.equal((active(html)[0]!.match(/<li>/g) ?? []).length, 3)
  assert.match(active(html)[0]!, /Vous ne pouvez utiliser/)
})

test('identifie les options de Véritable Lumière au milieu des autres effets', () => {
  const text = 'Votre adversaire ne peut pas cibler vos monstres. Si cette carte est envoyée au Cimetière : détruisez vos monstres. Vous ne pouvez utiliser l’effet suivant qu’une fois par tour. Vous pouvez activer 1 de ces effets ;\n●Invoquez Spécialement 1 monstre.\n●Posez 1 Magie/Piège depuis votre Deck.'
  assert.match(active(formatDesc(text, 1, 'Invoquer Spécialement'))[0]!, /Invoquez/)
  assert.match(active(formatDesc(text, 2, 'Poser une Magie ou un Piège'))[0]!, /Posez/)
  assert.equal(active(formatDesc(text, 0, '', true)).length, 0)
})

test('sépare les numéros sur une ligne et conserve les références à ces numéros', () => {
  const html = formatDesc('① Piochez 1 carte. Vous ne pouvez utiliser l’effet ① qu’une fois par tour. ② Détruisez 1 carte.', 1)
  assert.equal(blocks(html).length, 2)
  assert.match(active(html)[0]!, /Vous ne pouvez utiliser/)
  assert.doesNotMatch(active(html)[0]!, /Détruisez/)
})

test('conserve les abréviations et les points dans les noms de cartes', () => {
  const html = formatDesc('Si vous contrôlez "Dr. Dragon" : Invoquez Sp. 1 monstre. Puis piochez 1 carte. Si cette carte est détruite : piochez 2 cartes.', 1)
  assert.equal(blocks(html).length, 2)
  assert.match(active(html)[0]!, /Puis piochez/)
})

test('colore aussi une activation de Magie sans numéro et conserve son coût', () => {
  const html = formatDesc('Activez cette carte en payant 1000 LP. Annulez les effets des monstres face recto.', 0, '', true)
  assert.equal(active(html).length, 1)
  assert.match(active(html)[0]!, /1000 LP/)
  assert.match(active(html)[0]!, /Annulez/)
})

test('conserve les sections Pendule et Monstre et échappe les balises du catalogue', () => {
  const html = formatDesc('[Pendulum Effect]\n① Draw 1 card.\n[Monster Effect]\n② Destroy <script>alert("card")</script>.', 2)
  assert.equal((html.match(/class="eff-section"/g) ?? []).length, 2)
  assert.equal(active(html).length, 1)
  assert.doesNotMatch(html, /<script>/)
  assert.match(active(html)[0]!, /&#60;script&#62;/)
  assert.equal(active(formatDesc('If summoned: Draw 1 card.')).length, 0)
})
