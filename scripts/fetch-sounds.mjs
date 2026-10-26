#!/usr/bin/env node
// Télécharge les sons du jeu dans data/sounds/ (ignoré par git, comme les images de cartes) :
// les bruitages et une sélection de musiques du pack « EDOPRO-Soundpack » de Lahrenheit.
// Les bruitages sont pour la plupart sous licence libre (voir CREDITS.md du dépôt d'origine), mais les
// musiques viennent de jeux du commerce : elles restent sur ta machine et ne doivent jamais être
// ajoutées au dépôt. Environ 15 Mo en tout. Les fichiers déjà présents ne sont pas redemandés.
//
// Usage : npm run fetch-sounds
import { existsSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/sounds')
const RAW = 'https://raw.githubusercontent.com/Lahrenheit/EDOPRO-Soundpack/master/'

/** Bruitages (tous les .wav de la racine du dépôt). */
const SFX = [
  'activate', 'addcounter', 'attack', 'banished', 'button', 'carddrop', 'cardpick', 'chain', 'chatmessage', 'coinflip', 'damage', 'destroyed',
  'diceroll', 'directattack', 'draw', 'equip', 'flip', 'flip2', 'gainlp', 'info', 'menu', 'nextturn', 'phase', 'playerenter', 'question', 'removecounter',
  'reveal', 'set', 'shuffle', 'specialsummon', 'summon', 'target', 'token',
].map((n) => [`${n}.wav`, `sfx/${n}.wav`])

/**
 * Musiques : [chemin dans le dépôt, nom local]. Une seule piste « duel » est tirée au sort au début de chaque
 * partie et tourne en boucle jusqu'à la fin ; « menu » accompagne l'accueil et le salon.
 */
const BGM = [
  ['BGM/menu/menu.mp3', 'bgm/menu.mp3'],
  ['BGM/duel/BGM_DUEL_NORMAL_02.mp3', 'bgm/duel1.mp3'],
  ['BGM/duel/duel5.mp3', 'bgm/duel2.mp3'],
  ['BGM/duel/BGM_DUEL_NORMAL_04.mp3', 'bgm/duel3.mp3'],
  ['BGM/win/duelwin.mp3', 'bgm/win.mp3'],
  ['BGM/lose/duellose.mp3', 'bgm/lose.mp3'],
]

let total = 0
for (const [remote, local] of [...SFX, ...BGM]) {
  const file = path.join(OUT, local)
  if (existsSync(file)) continue
  await mkdir(path.dirname(file), { recursive: true })
  const url = RAW + remote.split('/').map(encodeURIComponent).join('/')
  const res = await fetch(url, { signal: AbortSignal.timeout(5 * 60_000) })
  if (!res.ok) throw new Error(`${remote} : HTTP ${res.status}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  await writeFile(`${file}.part`, bytes)
  await rename(`${file}.part`, file)
  total += bytes.length
  console.log(`  ${local} (${(bytes.length / 1024).toFixed(0)} Ko)`)
}
console.log(`Terminé : ${(total / 1048576).toFixed(1)} Mo téléchargés dans data/sounds.`)
