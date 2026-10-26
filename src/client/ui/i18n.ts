// Noms traduits des notions du jeu (attributs, types, phases, actions, zones). Les textes sont dans les fichiers de langue
// (src/client/locales) ; ces tables se lisent comme des objets (RACE['Dragon']) mais donnent le texte de la langue courante.
// Les noms et textes de cartes viennent de cards.json (name / desc, en français et en anglais).
import type { Phase } from '../../shared/protocol.ts'
import { has, t } from '../i18n.ts'

/** Un objet dont chaque valeur est la traduction de « préfixe.clé » ; une clé sans traduction vaut undefined. */
function table(prefix: string, keys: string[]): Record<string, string> {
  return new Proxy({} as Record<string, string>, {
    get: (_, key) => (typeof key === 'string' && has(`${prefix}.${key}`) ? t(`${prefix}.${key}`) : undefined),
    ownKeys: () => keys,
    getOwnPropertyDescriptor: (_, key) => (typeof key === 'string' && keys.includes(key) ? { enumerable: true, configurable: true, value: t(`${prefix}.${key}`) } : undefined),
    has: (_, key) => typeof key === 'string' && keys.includes(key),
  }) as Record<string, string>
}

const PHASE_IDS: Phase[] = ['draw', 'standby', 'main1', 'battle', 'main2', 'end']
const SHORT: Record<Phase, string> = { draw: 'DP', standby: 'SP', main1: 'M1', battle: 'BP', main2: 'M2', end: 'EP' }

/** Les phases du tour, avec leur sigle (le même dans toutes les langues) et leur nom. */
export const phases = (): { id: Phase; short: string; label: string }[] => PHASE_IDS.map((id) => ({ id, short: SHORT[id], label: t(`phase.${id}`) }))

export const PHASE_NAME = table('phase.long', PHASE_IDS) as Record<Phase, string>

export const ATTRIBUTE = table('attr', ["DARK", "LIGHT", "EARTH", "WATER", "FIRE", "WIND", "DIVINE"])

export const RACE = table('race', ["Aqua", "Beast", "Beast-Warrior", "Creator-God", "Cyberse", "Dinosaur", "Divine-Beast", "Dragon", "Fairy", "Fiend", "Fish", "Insect", "Machine", "Plant", "Psychic", "Pyro", "Reptile", "Rock", "Sea Serpent", "Spellcaster", "Thunder", "Warrior", "Winged Beast", "Wyrm", "Zombie", "Normal", "Continuous", "Quick-Play", "Equip", "Field", "Ritual", "Counter"])

export const KIND = table('card.kind', ['Normal', 'Effect', 'Tuner', 'Flip', 'Ritual', 'Pendulum', 'Link'])

export const ACTION_LABEL = table('action', ["summon", "spsummon", "set", "sset", "position", "activate", "attack"])

export const ZONE_LABEL = table('zone', ["hand", "monster", "spellTrap", "graveyard", "banished", "deck", "extra", "overlay"])
