// Compte : se connecter ou créer un compte (le jeu reste jouable en invité), puis son profil, ses parties et sa sécurité.
import type { ComponentChildren, JSX } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { DISPLAY_MAX, DISPLAY_MIN, PASSWORD_MAX, PASSWORD_MIN, USERNAME_MAX, USERNAME_MIN, cleanDisplayName, validDisplayName, validPassword, validUsername } from '../../shared/accounts.ts'
import type { PublicUser } from '../../shared/accounts.ts'
import type { DuelMeta } from '../../shared/formats.ts'
import type { RoomMode } from '../../shared/protocol.ts'
import { api } from '../app/api.ts'
import { authenticate, loadStats, signOut } from '../app/account.ts'
import { navigate } from '../app/navigation.ts'
import { ask, redraw, toast } from '../app/render.ts'
import { saved, store } from '../app/store.ts'
import { Button, IconButton } from '../ui/Button.tsx'
import { cx } from '../ui/cx.ts'
import { Icon } from '../ui/Icon.tsx'
import { Logo } from './Home.tsx'
import { t, tx } from '../i18n.ts'

const MODE_TITLE: Record<RoomMode, string> = { ai: 'home.ai', aivai: 'home.aivai', lan: 'home.lan', team: 'home.team', sandbox: 'home.sandbox' }

/** Un champ de formulaire : libellé visible, aide facultative. */
function Field(p: { label: string; hint?: string; children: ComponentChildren }): JSX.Element {
  return (
    <label class="acc-field">
      <span>{p.label}</span>
      {p.children}
      {p.hint && <small>{p.hint}</small>}
    </label>
  )
}

const text = (ev: Event): string => (ev.currentTarget as HTMLInputElement).value

// ───────────────────────────── Invité : connexion et inscription ─────────────────────────────

/** Robustesse d'un mot de passe, de 0 à 3 : longueur et variété des caractères (indication seulement, le serveur n'impose que la longueur). */
function strength(password: string): 0 | 1 | 2 | 3 {
  if (!password) return 0
  const kinds = [/[a-zàâçéèêëîïôûùüÿ]/, /[A-ZÀÂÇÉÈÊËÎÏÔÛÙÜŸ]/, /\d/, /[^\w\s]/].filter((re) => re.test(password)).length
  const score = (password.length >= PASSWORD_MIN ? 1 : 0) + (password.length >= 12 ? 1 : 0) + (kinds >= 3 ? 1 : 0)
  return Math.min(3, Math.max(1, score)) as 1 | 2 | 3
}

/** Un champ de la page de connexion : libellé, aide, et pour un mot de passe un bouton afficher / masquer. */
function AuthField(p: { label: string; hint?: string; password?: boolean; children: (type: 'text' | 'password') => JSX.Element }): JSX.Element {
  const [shown, setShown] = useState(false)
  return (
    <label class="auth-field">
      <span class="auth-label">{p.label}</span>
      <span class="auth-input">
        {p.children(p.password && !shown ? 'password' : 'text')}
        {p.password && (
          <button type="button" class="auth-eye" aria-pressed={shown} aria-label={t(shown ? 'auth.hidePassword' : 'auth.showPassword')} onClick={() => setShown(!shown)}>
            {t(shown ? 'auth.hide' : 'auth.show')}
          </button>
        )}
      </span>
      {p.hint && <small>{p.hint}</small>}
    </label>
  )
}

function AuthForms(): JSX.Element {
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [display, setDisplay] = useState('')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const register = tab === 'register'
  const level = strength(password)

  const submit = async (ev: Event): Promise<void> => {
    ev.preventDefault()
    setError(null)
    if (register) {
      const shown = cleanDisplayName(display || username)
      if (!validUsername(username.trim())) return setError(t('auth.badUsername', { min: USERNAME_MIN, max: USERNAME_MAX }))
      if (!validDisplayName(shown)) return setError(t('auth.badDisplayName', { min: DISPLAY_MIN, max: DISPLAY_MAX }))
      if (!validPassword(password)) return setError(t('auth.badPassword', { min: PASSWORD_MIN }))
      if (password !== again) return setError(t('auth.mismatch'))
    } else if (!username.trim() || !password) return setError(t('auth.fillAll'))
    setBusy(true)
    const failed = await authenticate(tab, { username: username.trim(), password, ...(register && display.trim() ? { displayName: display } : {}) })
    setBusy(false)
    if (failed) return setError(failed)
    setPassword('')
    setAgain('')
    toast(t(register ? 'auth.created' : 'auth.welcome', { name: store.name }))
  }

  return (
    <div class="auth">
      <aside class="auth-brand" aria-label={t('auth.heroTitle')}>
        <Logo />
        <h2>{t('auth.heroTitle')}</h2>
        <ul>
          {([['deck', 'auth.perkDecks'], ['history', 'auth.perkHistory'], ['flag', 'auth.perkTournaments']] as const).map(([icon, key]) => (
            <li key={key}>
              <Icon name={icon} />
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>
      </aside>
      <div class="auth-card">
        <div class="auth-tabs" role="tablist" aria-label={t('auth.title')}>
          {(['login', 'register'] as const).map((k) => (
            <button type="button" role="tab" key={k} aria-selected={tab === k} class={cx('auth-tab', tab === k && 'on')} data-act={`auth-${k}`} onClick={() => (setTab(k), setError(null))}>
              {t(k === 'login' ? 'auth.login' : 'auth.register')}
            </button>
          ))}
        </div>
        <form class="auth-form" onSubmit={(ev) => void submit(ev)} noValidate>
          <AuthField label={t('auth.username')} hint={register ? t('auth.usernameHint', { min: USERNAME_MIN, max: USERNAME_MAX }) : undefined}>
            {() => <input name="username" autocomplete="username" autocapitalize="none" spellcheck={false} enterkeyhint="next" maxLength={USERNAME_MAX} value={username} onInput={(e) => setUsername(text(e))} />}
          </AuthField>
          {register && (
            <AuthField label={t('auth.displayName')} hint={t('auth.displayNameHint')}>
              {() => <input name="display" autocomplete="nickname" enterkeyhint="next" maxLength={DISPLAY_MAX} value={display} placeholder={username} onInput={(e) => setDisplay(text(e))} />}
            </AuthField>
          )}
          <AuthField label={t('auth.password')} password hint={register ? t('auth.passwordHint', { min: PASSWORD_MIN }) : undefined}>
            {(type) => <input name="password" type={type as 'password'} autocomplete={register ? 'new-password' : 'current-password'} enterkeyhint={register ? 'next' : 'go'} maxLength={PASSWORD_MAX} value={password} onInput={(e) => setPassword(text(e))} />}
          </AuthField>
          {register && password && (
            <div class={cx('auth-meter', `l${level}`)} role="status">
              <i /><i /><i />
              <span>{t(`auth.strength.${level}`)}</span>
            </div>
          )}
          {register && (
            <AuthField label={t('auth.passwordAgain')} password>
              {(type) => <input name="password2" type={type as 'password'} autocomplete="new-password" enterkeyhint="go" maxLength={PASSWORD_MAX} value={again} onInput={(e) => setAgain(text(e))} />}
            </AuthField>
          )}
          {error && (
            <p class="auth-error" role="alert">
              {error}
            </p>
          )}
          <Button variant="primary" act="auth-submit" type="submit" disabled={busy}>
            {busy ? t('auth.working') : t(register ? 'auth.createBtn' : 'auth.loginBtn')}
          </Button>
        </form>
        <div class="auth-guest">
          <p>{t('auth.guestNote')}</p>
          <Button small act="auth-guest" onClick={() => navigate('home')}>
            {t('auth.guestBtn')}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ───────────────────────────── Compte connecté ─────────────────────────────

interface DuelRow {
  id: string
  endedAt: number
  mode: RoomMode
  format: string
  challenge: string
  result: 'win' | 'loss' | 'draw'
  deckName: string
  opponents: string[]
  meta: DuelMeta
}

function History(): JSX.Element {
  const [rows, setRows] = useState<DuelRow[] | null>(null)
  useEffect(() => {
    void api<DuelRow[]>('/api/duels?limit=15').then((r) => setRows(r.ok && r.body ? r.body : []))
  }, [store.user?.id])
  if (!rows) return <p class="muted">{t('common.loading')}</p>
  if (!rows.length) return <p class="muted">{t('account.noDuels')}</p>
  return (
    <ul class="acc-duels">
      {rows.map((d) => (
        <li key={d.id} class={d.result}>
          <b class="acc-result">{t(`account.result.${d.result}`)}</b>
          <span>
            {d.opponents.length ? t('account.versus', { who: d.opponents.map(tx).join(' & ') }) : t(MODE_TITLE[d.mode])}
            <small>
              {t(MODE_TITLE[d.mode])} · {t(`format.${d.format}`)}
              {d.challenge !== 'none' ? ` · ${t(`challenge.${d.challenge}`)}` : ''}
              {d.meta.tournament ? ` · ${d.meta.tournament.name}` : ''} · {d.deckName}
            </small>
          </span>
          <time dateTime={new Date(d.endedAt).toISOString()}>{new Date(d.endedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</time>
        </li>
      ))}
    </ul>
  )
}

function Profile({ user }: { user: PublicUser }): JSX.Element {
  const [name, setName] = useState(user.displayName)
  const [nameError, setNameError] = useState<string | null>(null)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [passError, setPassError] = useState<string | null>(null)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [legacy, setLegacy] = useState(0)
  useEffect(() => {
    void loadStats()
    void api<{ count: number }>('/api/decks/legacy').then((r) => setLegacy(r.ok && r.body ? r.body.count : 0))
  }, [user.id])

  const saveName = async (ev: Event): Promise<void> => {
    ev.preventDefault()
    setNameError(null)
    const shown = cleanDisplayName(name)
    if (!validDisplayName(shown)) return setNameError(t('auth.badDisplayName', { min: DISPLAY_MIN, max: DISPLAY_MAX }))
    if (shown === user.displayName) return
    const r = await api<{ user?: PublicUser; error?: string }>('/api/auth/me', { method: 'PATCH', json: { displayName: shown } })
    if (!r.ok || !r.body?.user) return setNameError(r.body?.error ? tx(r.body.error) : t('auth.failed'))
    store.user = r.body.user
    store.name = r.body.user.displayName
    setName(r.body.user.displayName)
    redraw()
    toast(t('account.nameSaved'))
  }

  const changePassword = async (ev: Event): Promise<void> => {
    ev.preventDefault()
    setPassError(null)
    if (!validPassword(next)) return setPassError(t('auth.badPassword', { min: PASSWORD_MIN }))
    if (next !== again) return setPassError(t('auth.mismatch'))
    const r = await api<{ closed?: number; error?: string }>('/api/auth/password', { method: 'POST', json: { current, next } })
    if (!r.ok) return setPassError(r.body?.error ? tx(r.body.error) : t('auth.failed'))
    setCurrent('')
    setNext('')
    setAgain('')
    toast(t('account.passwordSaved', { n: r.body?.closed ?? 0 }))
  }

  const others = (): void =>
    ask({
      title: t('account.othersTitle'),
      text: t('account.othersText'),
      ok: t('account.othersBtn'),
      danger: false,
      run: () => void api<{ closed: number }>('/api/auth/logout-all', { method: 'POST' }).then((r) => toast(t('account.othersDone', { n: r.body?.closed ?? 0 }))),
    })

  const claim = async (): Promise<void> => {
    const r = await api<{ claimed: number; renamed: number }>('/api/decks/legacy/claim', { method: 'POST' })
    if (!r.ok || !r.body) return toast(r.body ? t('auth.failed') : t('auth.unreachable'))
    setLegacy(0)
    toast(t('account.claimed', { n: r.body.claimed }))
  }

  const remove = (): void => {
    if (!deletePassword) return setDeleteError(t('auth.fillAll'))
    setDeleteError(null)
    ask({
      title: t('account.deleteTitle'),
      text: t('account.deleteText'),
      ok: t('account.deleteBtn'),
      run: () =>
        void api<{ error?: string }>('/api/auth/delete', { method: 'POST', json: { password: deletePassword } }).then((r) => {
          if (!r.ok) return setDeleteError(r.body?.error ? tx(r.body.error) : t('auth.failed'))
          saved.remove('auth')
          store.user = null
          store.stats = null
          store.name = saved.get('name') ?? t('home.defaultName')
          navigate('home')
          toast(t('account.deleted'))
        }),
    })
  }

  const s = store.stats
  return (
    <div class="opt-list acc-profile">
      <section class="opt-section">
        <h3>{t('account.profile')}</h3>
        <div class="opt-row">
          <span>
            <b>{t('auth.username')}</b>
            <small>{t('account.usernameFixed')}</small>
          </span>
          <div class="opt-control">
            <code class="acc-username">{user.username}</code>
          </div>
        </div>
        <form class="acc-inline" onSubmit={(ev) => void saveName(ev)}>
          <Field label={t('auth.displayName')} hint={t('account.displayNameText')}>
            <input name="display-name" autocomplete="nickname" maxLength={DISPLAY_MAX} value={name} onInput={(e) => setName(text(e))} />
          </Field>
          <Button small type="submit" act="name-save" disabled={cleanDisplayName(name) === user.displayName}>
            {t('common.save')}
          </Button>
          {nameError && (
            <p class="acc-error" role="alert">
              {nameError}
            </p>
          )}
        </form>
      </section>

      <section class="opt-section">
        <h3>{t('account.progress')}</h3>
        <dl class="acc-stats">
          {([['duels', 'account.duels'], ['wins', 'account.wins'], ['losses', 'account.losses'], ['draws', 'account.draws']] as const).map(([k, label]) => (
            <div key={k}>
              <dt>{t(label)}</dt>
              <dd>{s ? s[k] : '–'}</dd>
            </div>
          ))}
        </dl>
        <History />
      </section>

      {legacy > 0 && (
        <section class="opt-section">
          <h3>{t('account.legacyTitle')}</h3>
          <div class="opt-row">
            <span>
              <b>{t('account.legacyCount', { n: legacy })}</b>
              <small>{t('account.legacyText')}</small>
            </span>
            <div class="opt-control">
              <Button small act="legacy-claim" onClick={() => void claim()}>
                {t('account.legacyBtn')}
              </Button>
            </div>
          </div>
        </section>
      )}

      <section class="opt-section">
        <h3>{t('account.security')}</h3>
        <form class="acc-form" onSubmit={(ev) => void changePassword(ev)} noValidate>
          <Field label={t('account.currentPassword')}>
            <input name="current" type="password" autocomplete="current-password" maxLength={PASSWORD_MAX} value={current} onInput={(e) => setCurrent(text(e))} />
          </Field>
          <Field label={t('account.newPassword')} hint={t('auth.passwordHint', { min: PASSWORD_MIN })}>
            <input name="next" type="password" autocomplete="new-password" maxLength={PASSWORD_MAX} value={next} onInput={(e) => setNext(text(e))} />
          </Field>
          <Field label={t('auth.passwordAgain')}>
            <input name="again" type="password" autocomplete="new-password" maxLength={PASSWORD_MAX} value={again} onInput={(e) => setAgain(text(e))} />
          </Field>
          {passError && (
            <p class="acc-error" role="alert">
              {passError}
            </p>
          )}
          <Button small type="submit" act="password-save" disabled={!current || !next}>
            {t('account.changePassword')}
          </Button>
        </form>
        <div class="opt-row">
          <span>
            <b>{t('account.othersTitle')}</b>
            <small>{t('account.othersHint')}</small>
          </span>
          <div class="opt-control">
            <Button small act="logout-others" onClick={others}>
              {t('account.othersBtn')}
            </Button>
          </div>
        </div>
      </section>

      <section class="opt-section">
        <h3>{t('account.account')}</h3>
        <div class="opt-row">
          <span>
            <b>{t('account.logout')}</b>
            <small>{t('account.logoutText')}</small>
          </span>
          <div class="opt-control">
            <Button small act="logout" onClick={() => void signOut()}>
              {t('account.logout')}
            </Button>
          </div>
        </div>
        <details class="acc-danger">
          <summary>{t('account.deleteTitle')}</summary>
          <p class="muted">{t('account.deleteHint')}</p>
          <Field label={t('auth.password')}>
            <input name="delete-password" type="password" autocomplete="current-password" maxLength={PASSWORD_MAX} value={deletePassword} onInput={(e) => setDeletePassword(text(e))} />
          </Field>
          {deleteError && (
            <p class="acc-error" role="alert">
              {deleteError}
            </p>
          )}
          <Button small variant="danger" act="delete-account" onClick={remove}>
            {t('account.deleteBtn')}
          </Button>
        </details>
      </section>
    </div>
  )
}

export function AccountScreen(): JSX.Element {
  const user = store.user
  return (
    <div class="screen options account">
      <header>
        <IconButton icon="back" label={t('common.back')} act="back" onClick={() => navigate('home')} />
        <div class="lobby-title">
          <small>Duelborne</small>
          <h1>{user ? t('account.title', { name: user.displayName }) : t('auth.title')}</h1>
        </div>
      </header>
      {user ? <Profile user={user} /> : <AuthForms />}
    </div>
  )
}
