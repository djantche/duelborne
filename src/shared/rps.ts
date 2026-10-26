// Pierre-feuille-ciseaux : les trois mains et qui bat qui. Le moteur de règles (ocgcore) les numérote autrement
// (1 ciseaux, 2 pierre, 3 feuille) : la conversion est faite ici, une seule fois.
import type { Hand } from './protocol.ts'

export const ROCK = 0
export const PAPER = 1
export const SCISSORS = 2
export const HANDS: readonly Hand[] = [ROCK, PAPER, SCISSORS]

/** Résultat d'une manche : 'a' ou 'b' gagne, null = égalité. La feuille bat la pierre, la pierre les ciseaux, les ciseaux la feuille. */
export function rpsWinner(a: Hand, b: Hand): 'a' | 'b' | null {
  if (a === b) return null
  return (a - b + 3) % 3 === 1 ? 'a' : 'b'
}

/** La main que `hand` bat. */
export const beaten = (hand: Hand): Hand => ((hand + 2) % 3) as Hand

/** Valeur du moteur (1 ciseaux, 2 pierre, 3 feuille) → main. */
export const handFromCore = (v: number): Hand => (v === 1 ? SCISSORS : v === 3 ? PAPER : ROCK)

/** Rang dans la question du moteur (ciseaux, pierre, feuille) → main, et l'inverse. */
const CORE_ORDER: readonly Hand[] = [SCISSORS, ROCK, PAPER]
export const handFromOption = (i: number): Hand => CORE_ORDER[i] ?? ROCK
export const optionOfHand = (h: Hand): number => CORE_ORDER.indexOf(h)

export const randomHand = (): Hand => HANDS[Math.floor(Math.random() * 3)] as Hand
