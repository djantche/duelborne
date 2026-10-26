import type { JSX } from 'preact'
import { createPortal } from 'preact/compat'
import { leaveRoom } from '../../app/actions.ts'
import { store } from '../../app/store.ts'
import { t } from '../../i18n.ts'
import { IconButton } from '../../ui/Button.tsx'
import { navigateConsole } from './controller.ts'
import { duel } from './state.ts'

export function SandboxNavigation(): JSX.Element | null {
  if (store.room?.mode !== 'sandbox' || store.screen === 'replay' || !duel.view || duel.view.watching) return null
  const navigation = duel.view.prompt?.consoleNavigation
  const prompt = duel.view.prompt
  const open = prompt?.kind === 'idle' && prompt.options.some((item) => item.action === 'activate' && item.cardId === 3900000001)
  return createPortal(<nav class="sandbox-navigation glass" data-dialog-tools aria-label={t('sandbox.navigation')}>
    <IconButton icon="back" label={t('sandbox.back')} act="console-back" disabled={duel.busy || !navigation?.back} onClick={() => navigateConsole('back')} />
    <IconButton icon="computer" label={t('sandbox.consoleHome')} act="console-home" disabled={duel.busy || !navigation?.home && !open} onClick={() => navigateConsole('home')} />
    <IconButton icon="close" label={t('sandbox.gameHome')} act="sandbox-home" onClick={leaveRoom} />
  </nav>, document.body)
}
