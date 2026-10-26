// Références de chaîne indépendantes des cartes physiques. Activation et résolution emploient l’aperçu des révélations.
import type { GameEvent, Seat } from '../../../shared/protocol.ts'
import type { ClientCard } from '../../ui/cardview.ts'
import { negateCard, negateOnBoard } from './negation.tsx'
import { presentEffectNotice, resetEffectNotices } from './reveal.ts'
import { liftActivatedCard } from './effectActivation.ts'

type Link = Extract<GameEvent, { type: 'chain' }>
interface Entry { link: Link; data: ClientCard; negated: boolean }

class ChainPresentation {
  private entries = new Map<number, Entry>()
  private announced = new Map<number, Entry>()

  async activate(link: Link, data: ClientCard, _you: Seat, isCurrent?: () => boolean, afterLift?: () => void): Promise<void> {
    if (isCurrent?.() === false) return
    if (link.index === 1) { this.entries.clear(); this.announced.clear() }
    const entry = { link, data, negated: false }
    this.entries.set(link.index, entry)
    this.announced.set(link.index, entry)
    await liftActivatedCard(link.uid, isCurrent)
    if (isCurrent?.() === false) return
    afterLift?.()
    await presentEffectNotice(data, 'activate', link.index, isCurrent, { n: link.effect ?? 0, label: link.label, uid: link.uid })
  }

  async resolve(index: number, isCurrent?: () => boolean): Promise<boolean> {
    if (isCurrent?.() === false) return false
    const entry = this.entries.get(index)
    if (!entry) return this.announced.has(index)
    if (!entry.negated) await presentEffectNotice(entry.data, 'resolve', index, isCurrent, { n: entry.link.effect ?? 0, label: entry.link.label, uid: entry.link.uid })
    this.entries.delete(index)
    return true
  }

  async negate(index: number, data: ClientCard | null, isCurrent?: () => boolean): Promise<boolean> {
    if (isCurrent?.() === false) return false
    const entry = this.entries.get(index) ?? this.announced.get(index)
    if (!entry) return false
    entry.negated = true
    const source = entry.link.uid === null ? null : document.querySelector<HTMLElement>(`#app .card[data-uid="${entry.link.uid}"]`)
    if (source) await negateOnBoard(source, isCurrent)
    else await negateCard(data ?? entry.data, null, (document.querySelector('.arena') ?? document.body).getBoundingClientRect(), isCurrent)
    return true
  }

  async hint(data: ClientCard, isCurrent?: () => boolean): Promise<void> {
    if ([...this.announced.values()].some((entry) => entry.data.id === data.id)) return
    await presentEffectNotice(data, 'applied', 0, isCurrent)
  }

  // L’ordre reste dans la barre compacte ; aucune carte physique n’est retenue.
  async finish(): Promise<void> { this.entries.clear(); this.announced.clear() }
  reset(): void { this.entries.clear(); this.announced.clear(); resetEffectNotices() }
}

export const chainPresentation = new ChainPresentation()
