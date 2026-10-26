// Options : langue, son, affichage, nom du joueur. Chaque réglage s'applique tout de suite et se garde dans le navigateur.
import type { ComponentChildren, JSX } from 'preact'
import { useState } from 'preact/hooks'
import { send } from '../app/net.ts'
import { toggleFullscreen } from '../app/actions.ts'
import { currentAvatar, savePrefs, setAvatar } from '../app/account.ts'
import { canInstall, installApp } from '../app/pwa.ts'
import { redraw } from '../app/render.ts'
import { navigate } from '../app/navigation.ts'
import { saved, store } from '../app/store.ts'
import { LOCALES, isDefaultName, lang, languages, setLang, t } from '../i18n.ts'
import { audioPrefs, setMusic, setSfx } from '../ui/audio.ts'
import { Avatar } from '../ui/Avatar.tsx'
import { AvatarPicker } from '../ui/AvatarPicker.tsx'
import { Button, IconButton } from '../ui/Button.tsx'
import { Select } from '../ui/Select.tsx'
import { Switch } from '../ui/Switch.tsx'
import { setSortLocale } from './deck/model.ts'

/** Une ligne de réglage : son nom, une phrase d'aide, et le contrôle. */
function Row({ title, text, children }: { title: string; text?: string; children: ComponentChildren }): JSX.Element {
  return (
    <div class="opt-row">
      <span>
        <b>{title}</b>
        {text && <small>{text}</small>}
      </span>
      <div class="opt-control">{children}</div>
    </div>
  )
}

const Section = ({ title, children }: { title: string; children: ComponentChildren }): JSX.Element => (
  <section class="opt-section">
    <h3>{title}</h3>
    {children}
  </section>
)

export function OptionsScreen(): JSX.Element {
  const [picking, setPicking] = useState(false)
  const avatar = currentAvatar()
  const shownName = store.user ? store.user.displayName : store.name
  const audio = audioPrefs()
  const back = (): void => {
    navigate('home')
  }
  const pickLang = (id: string): void => {
    setLang(id)
    setSortLocale(LOCALES[id]?._code ?? id)
    savePrefs({ lang: id })
    redraw()
  }
  const rename = (value: string): void => {
    if (store.user) return
    const name = value.trim().slice(0, 24) || t('home.defaultName')
    if (name === store.name) return
    store.name = name
    saved.set('name', name)
    send({ t: 'rename', name })
  }
  return (
    <div class="screen options">
      <header>
        <IconButton icon="back" label={t('common.back')} act="back" onClick={back} />
        <div class="lobby-title">
          <small>Duelborne</small>
          <h1>{t('opt.title')}</h1>
        </div>
      </header>
      <div class="opt-list">
        <Section title={t('opt.language')}>
          <Row title={t('opt.language')} text={t('opt.languageText')}>
            <Select id="opt-lang" value={lang()} onChange={pickLang} choices={languages().map((l) => ({ value: l.id, label: l.name }))} />
          </Row>
        </Section>
        <Section title={t('opt.account')}>
          <Row title={store.user ? t('opt.accountOn', { name: store.user.displayName }) : t('opt.accountOff')} text={store.user ? t('opt.accountOnText') : t('opt.accountOffText')}>
            <Button small act="opt-account" onClick={() => navigate('account')}>
              {store.user ? t('opt.accountOpen') : t('home.login')}
            </Button>
          </Row>
        </Section>
        <Section title={t('opt.player')}>
          <Row title={t('opt.name')} text={t('opt.nameText')}>
            <input class="opt-input" name="opt-name" maxLength={24} autocomplete="off" disabled={!!store.user} value={store.user ? store.user.displayName : isDefaultName(store.name) ? '' : store.name} placeholder={t('home.defaultName')} onChange={(e) => rename((e.currentTarget as HTMLInputElement).value)} />
          </Row>
          <Row title={t('opt.avatar')} text={t('opt.avatarText')}>
            <span class="opt-avatar">
              <Avatar card={avatar} name={shownName} />
              <Button small act="opt-avatar" onClick={() => setPicking(true)}>{t('opt.avatarChoose')}</Button>
            </span>
          </Row>
        </Section>
        <Section title={t('opt.sound')}>
          <Row title={t('opt.music')} text={t('opt.musicText')}>
            <Switch on={audio.music} label={t('opt.music')} onChange={(on) => (setMusic(on), savePrefs({ music: on }), redraw())} />
          </Row>
          <Row title={t('opt.sfx')} text={t('opt.sfxText')}>
            <Switch on={audio.sfx} label={t('opt.sfx')} onChange={(on) => (setSfx(on), savePrefs({ sfx: on }), redraw())} />
          </Row>
        </Section>
        <Section title={t('opt.display')}>
          <Row title={t('opt.fullscreen')} text={t('opt.fullscreenText')}>
            <Button small act="opt-fullscreen" onClick={toggleFullscreen}>
              {t('opt.fullscreenBtn')}
            </Button>
          </Row>
          {canInstall() && (
            <Row title={t('opt.install')} text={t('opt.installText')}>
              <Button small act="opt-install" onClick={() => void installApp()}>
                {t('opt.installBtn')}
              </Button>
            </Row>
          )}
        </Section>
      </div>
      <p class="opt-note">{t('opt.saved')}</p>
      {picking && <AvatarPicker current={avatar} name={shownName} onPick={setAvatar} onClose={() => setPicking(false)} />}
    </div>
  )
}
