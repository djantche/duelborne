// Les scripts de deck connus de l'ordinateur, et leur détection.
import type { Playbook } from '../playbook.ts'
import { blueEyes } from './blue-eyes.ts'
import { yubel } from './yubel.ts'

export const PLAYBOOKS: Playbook[] = [yubel, blueEyes]

/** Le script qui convient à ce deck (liste de ses cartes), ou null : l'ordinateur joue alors avec ses seules règles. */
export function playbookFor(deck: number[]): Playbook | null {
  const pb = PLAYBOOKS.find((pb) => pb.matches(deck))
  return pb ? { ...pb, deck: [...deck] } : null
}
