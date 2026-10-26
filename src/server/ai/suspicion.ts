// Soupçons : ce que l'ordinateur croit de la main de son adversaire, sans la lire.
//
// Il connaît le deck adverse tel qu'établi avant la distribution (comme un duelliste qui connaît le deck de son
// adversaire), et se souvient de chaque carte révélée au cours de la partie : main publique, cimetière,
// bannissement, faces recto du terrain, chaîne. Ce qui n'a jamais été vu forme le « pont invisible ». La main
// inconnue est traitée comme un échantillon de ce pont : densités (pièges, cartes qui répondent depuis la main)
// et meilleur monstre encore à voir. Aucune identité de carte piochée n'est jamais lue — l'identité reste
// inconnue tant qu'une carte n'est pas révélée au duel (voir view.ts : une carte cachée n'a pas de cardId).
import type { DuelView, Seat } from '../../shared/protocol.ts'
import { TYPE, cardData } from '../ocg/data.ts'

/** Jeu-Rapide : peut fournir une réponse après avoir été posée. */
const QUICK = 0x10000
/** Carte à effet (monstre ou pas), d'après le bit du moteur. */
const hasEffect = (type: number): boolean => (type & 0x20) !== 0

export interface Suspicion {
  /** Cartes de la main adverse dont l'identité est inconnue. */
  unknownHand: number
  /** Copies jamais vues en tout. */
  unseen: number
  /** Part des copies jamais vues qui sont des Pièges (0..1). */
  trapDensity: number
  /** Part des copies jamais vues qui peuvent répondre depuis la main, hors Pièges (0..1) : Jeu-Rapides et monstres à effet, pondérés. */
  handHazard: number
  /** Meilleure attaque d'un monstre encore jamais vu : ce qui peut surgir de la main adverse au tour suivant. */
  loomingAtk: number
}

/** Risque d'une réponse cachée au combat : compter les ressources réellement présentes, sans lire leur identité. */
export function battleDanger(view: DuelView, seat: Seat, suspect: Suspicion): number {
  const foe = view.players[seat === 0 ? 1 : 0]
  const sets = foe.spellTraps.filter((s) => s && !s.faceUp).length
  const unknownHand = foe.hand.filter((c) => c.cardId === null).length
  const perSet = Math.min(0.65, 0.16 + 0.45 * suspect.trapDensity)
  const perHand = 0.16 * suspect.handHazard
  return Math.min(0.8, 1 - (1 - perSet) ** sets * (1 - perHand) ** unknownHand)
}

/** Le suivi du pont invisible adverse, tenu d'une partie à l'autre. */
export class Suspects {
  /** Copies de chaque carte dans le deck adverse, établi avant la distribution. */
  private readonly pool = new Map<number, number>()
  /** Copies de chaque carte déjà révélées au cours de la partie (mémoire monotone : une carte vue l'est pour de bon). */
  private readonly seen = new Map<number, number>()

  constructor(deck: number[]) {
    for (const id of deck) this.pool.set(id, (this.pool.get(id) ?? 0) + 1)
  }

  /** Mémorise ce que cette vue permet d'affirmer : les cartes révélées y font déjà partie du passé. */
  remember(view: DuelView, seat: Seat): void {
    const foe = view.players[seat === 0 ? 1 : 0]
    // Une instance est comptée par son uid, où qu'elle apparaisse (chaîne, terrain, main publique, cimetière) :
    // deux exemplaires vus font deux, et une même carte dans deux zones ne compte qu'une fois.
    const passed = new Set<number>()
    const tally = new Map<number, number>()
    const see = (uid: number, cardId: number | null): void => {
      if (cardId === null || passed.has(uid)) return
      passed.add(uid)
      tally.set(cardId, (tally.get(cardId) ?? 0) + 1)
    }
    // Main : seules les cartes publiques (révélées) ont un cardId.
    for (const c of foe.hand) see(c.uid, c.cardId)
    // Terrain face recto (une carte cachée n'a jamais d'identité) ; le cimetière est toujours visible,
    // le bannissement seulement quand on a le droit de le voir.
    for (const m of foe.monsters) if (m) see(m.card.uid, m.faceUp ? m.card.cardId : null)
    for (const s of [...foe.spellTraps, foe.fieldZone]) if (s) see(s.card.uid, s.faceUp ? s.card.cardId : null)
    for (const c of foe.graveyard) see(c.uid, c.cardId)
    for (const c of foe.banished) see(c.uid, c.cardId)
    // Maillons de la chaîne : publiques par nature (une chaîne se joue à découvert), sans uid connu ; on ne
    // les compte que si leur carte n'a pas déjà été vue ailleurs dans cette vue.
    for (const c of view.chain) if (c.seat !== seat && !tally.has(c.cardId)) tally.set(c.cardId, 1)
    for (const [id, n] of tally) this.seen.set(id, Math.max(this.seen.get(id) ?? 0, n))
  }

  /** Le profil de menace, au jour le jour, à partir du pont invisible et de la main non révélée. */
  profile(view: DuelView, seat: Seat): Suspicion {
    const foe = view.players[seat === 0 ? 1 : 0]
    let unseen = 0
    let traps = 0
    let hazards = 0
    let looming = 0
    for (const [id, copies] of this.pool) {
      const left = Math.max(0, copies - (this.seen.get(id) ?? 0))
      if (!left) continue
      unseen += left
      const d = cardData(id)
      const type = d?.type ?? 0
      if (type & TYPE.TRAP) traps += left
      // Jeu-Rapide : l'intégralité des copies sont des menaces depuis la main ; monstre à effet : une part seulement
      // (beaucoup ne se déclenchent jamais depuis la main).
      else if (type & QUICK) hazards += left
      else if (type & TYPE.MONSTER && hasEffect(type)) hazards += left * 0.35
      // Un monstre à effet reste aussi une menace au combat : ne pas l'exclure après avoir
      // compté son éventuelle interruption (les boss modernes sont rarement des monstres normaux).
      if (type & TYPE.MONSTER) {
        const atk = Math.max(0, d?.attack ?? 0)
        if (atk > looming) looming = atk
      }
    }
    const unknownHand = foe.hand.filter((c) => c.cardId === null).length
    return {
      unknownHand,
      unseen,
      trapDensity: unseen > 0 ? traps / unseen : 0,
      handHazard: unseen > 0 ? hazards / unseen : 0,
      loomingAtk: looming,
    }
  }
}

/** Sans deck connu (couches de secours) : un profil neutre, d'après les seules cartes présentes dans la vue. */
export function blindSuspicion(view: DuelView, seat: Seat): Suspicion {
  const foe = view.players[seat === 0 ? 1 : 0]
  const backrow = foe.spellTraps.filter((s) => s && !s.faceUp).length
  return { unknownHand: foe.hand.filter((c) => c.cardId === null).length, unseen: backrow, trapDensity: backrow > 0 ? 0.5 : 0, handHazard: 0, loomingAtk: 2400 }
}
