import type { Seat } from '../../../shared/protocol.ts'
import { t, tx } from '../../i18n.ts'

/** Les deux côtés du plateau sont des joueurs, même lorsqu'aucun n'est le spectateur. */
export const duelistName = (names: readonly string[], seat: Seat): string => names[seat] ? tx(names[seat]) : t('duel.player', { n: seat + 1 })
