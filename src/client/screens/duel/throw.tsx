// Lancer de dés et de pièces, vu de DESSUS : un tapis apparaît, les dés (ou pièces) y sont jetés depuis le bord, roulent en
// tournant sur tous leurs axes, rebondissent et s'immobilisent sur le résultat donné par le moteur (le hasard est tiré côté
// serveur, jamais ici). Ce n'est qu'APRÈS leur arrêt qu'un gros texte de puissance annonce le compte.
import { render } from 'preact'
import type { JSX } from 'preact'
import { sfx } from '../../ui/audio.ts'
import { Coin, Die, dieTransform } from '../../ui/Dice3D.tsx'
import { PowerText } from '../../ui/PowerText.tsx'
import type { Tint } from '../../ui/PowerText.tsx'
import { EASE_OUT, centerOf, flash, node, play, ring, shake, sleep, sparks } from './anim.ts'
import type { Pt } from './anim.ts'
import { t } from '../../i18n.ts'

const rand = (a: number, b: number): number => a + Math.random() * (b - a)
const arena = (): Element => document.getElementById('arena') ?? document.body

interface Spot {
  x: number
  y: number
  /** Inclinaison finale à plat, pour que les pièces du lot ne soient pas toutes alignées. */
  rest: number
}

function Table({ kind, values, size, w, h, spots }: { kind: 'dice' | 'coin'; values: number[]; size: number; w: number; h: number; spots: Spot[] }): JSX.Element {
  return (
    <div class="throw-table" style={`width:${w}px;height:${h}px;--s:${size}px`}>
      {values.map((v, i) => (
        <div class="throw-spot" key={i} style={`left:${spots[i]?.x}px;top:${spots[i]?.y}px`}>
          <span class="throw-shade" />
          <div class="throw-fly">{kind === 'dice' ? <Die value={v} tilt={false} /> : <Coin heads={v === 1} />}</div>
        </div>
      ))}
    </div>
  )
}

/** Instants de la trajectoire (fraction de la durée) : jeté, en l'air, 1er contact, rebond, 2e contact, petit rebond, arrêt. */
const TIMES = [0, 0.2, 0.4, 0.55, 0.68, 0.79, 0.89, 1]
/** Hauteur au-dessus du tapis à chaque instant (1 = posé) : l'objet grossit en s'approchant de l'œil. */
const HEIGHT = [2.5, 1.9, 1, 1.34, 1, 1.15, 1, 1]
/** Part du trajet restant à parcourir depuis le bord (1 = au bord, 0 = à sa place) ; négatif = dépasse puis revient. */
const TRAVEL = [1, 0.64, 0.2, -0.07, 0.03, -0.02, 0.008, 0]
/** Part des tours restant à faire. */
const SPIN = [1, 0.78, 0.5, 0.36, 0.2, 0.1, 0.03, 0]
/** Flou de mouvement : net aux contacts avec le tapis, flou en l'air (plus la vitesse est grande, plus il est fort). */
const BLUR = [3.2, 2.4, 0, 1.6, 0, 0.8, 0, 0]
/** Basculement de la pièce sur sa tranche (degrés restants) : elle vacille avant de se coucher. */
const WOBBLE = [0, 22, -26, 20, -14, 9, -4, 0]

/** Lance tous les objets et rend la main quand le dernier est à l'arrêt. */
async function tumble(table: HTMLElement, kind: 'dice' | 'coin', values: number[], size: number, spots: Spot[], duration: number): Promise<void> {
  const jobs: Promise<unknown>[] = []
  const tr = table.getBoundingClientRect()
  table.querySelectorAll<HTMLElement>('.throw-spot').forEach((spot, i) => {
    const fly = spot.querySelector<HTMLElement>('.throw-fly') as HTMLElement
    const shade = spot.querySelector<HTMLElement>('.throw-shade') as HTMLElement
    const body = spot.querySelector<HTMLElement>(kind === 'dice' ? '.die-cube' : '.coin-body') as HTMLElement
    const v = values[i] as number
    const w = tr.width
    const h = tr.height
    // Départ hors du tapis, côté gauche ou droit, en bas : comme jeté depuis le joueur.
    const dir = i % 2 === 0 ? -1 : 1
    const sx = dir * (w * 0.62 + rand(0, w * 0.08)) - (spots[i]?.x ?? 0) + w / 2 + dir * rand(0, 30)
    const sy = h * rand(0.35, 0.8) - (spots[i]?.y ?? 0)
    const delay = i * 120
    const spinX = 360 * Math.round(rand(2, 4))
    const spinY = 360 * Math.round(rand(2, 4))
    const spinZ = rand(-420, 420)
    const rest = spots[i]?.rest ?? 0

    const flyFrames: Keyframe[] = TIMES.map((t, k) => ({
      offset: t,
      transform: `translate(${sx * (TRAVEL[k] as number)}px,${sy * (TRAVEL[k] as number)}px) scale(${HEIGHT[k]})`,
      easing: (HEIGHT[k + 1] ?? 1) < (HEIGHT[k] as number) ? 'cubic-bezier(.45,0,.95,.6)' : 'cubic-bezier(.1,.5,.4,1)',
    }))
    // L'ombre reste sur le tapis : plus l'objet est haut, plus elle s'éloigne, s'étale et s'éclaircit.
    const shadeFrames: Keyframe[] = TIMES.map((t, k) => {
      const hgt = (HEIGHT[k] as number) - 1
      return {
        offset: t,
        transform: `translate(${sx * (TRAVEL[k] as number) + hgt * size * 0.5}px,${sy * (TRAVEL[k] as number) + hgt * size * 0.75}px) scale(${1 + hgt * 0.2})`,
        opacity: hgt > 0 ? Math.max(0.12, 0.6 - hgt * 0.4) : 0.7,
        easing: flyFrames[k]?.easing as string,
      }
    })
    const bodyFrames: Keyframe[] = TIMES.map((t, k) => {
      const rem = SPIN[k] as number
      return {
        offset: t,
        transform:
          kind === 'dice'
            ? dieTransform(v, { x: spinX * rem, y: spinY * rem, z: spinZ * rem + rest * (1 - rem) }, true)
            : '', // pièces : transformation posée plus bas (mêmes tours à tous les instants)
        easing: 'linear',
      }
    })
    // Les tours des pièces sont tirés une fois : on garde la même valeur à tous les instants.
    if (kind === 'coin') {
      const turns = 360 * Math.round(rand(7, 10))
      const sign = Math.random() < 0.5 ? -1 : 1
      bodyFrames.forEach((f, k) => {
        const rem = SPIN[k] as number
        // Vue de dessus, la pièce tourne autour d'un axe à plat, vacille (rotateY) puis se pose sur sa face.
        f.transform = `rotateY(${-20 * (1 - rem) + sign * (WOBBLE[k] as number)}deg) rotateX(${(v === 1 ? 0 : 180) + turns * rem}deg) rotateZ(${spinZ * rem + rest * (1 - rem)}deg)`
      })
    }
    // Le flou est posé sur le conteneur de la pièce (un filtre aplatirait la 3D de la pièce elle-même).
    const blurFrames: Keyframe[] = TIMES.map((t, k) => ({ offset: t, filter: `blur(${(BLUR[k] as number) * (kind === 'coin' ? 1 : 0.7)}px) brightness(${1 + (BLUR[k] as number) * 0.05})`, easing: 'linear' }))
    jobs.push(play(spot, blurFrames, { duration, delay, fill: 'both' }))
    jobs.push(play(fly, flyFrames, { duration, delay, fill: 'both' }))
    jobs.push(play(shade, shadeFrames, { duration, delay, fill: 'both' }))
    jobs.push(play(body, bodyFrames, { duration, delay, fill: 'both' }))
    // Chaque contact avec le tapis : un petit choc.
    for (const t of [TIMES[2] as number, TIMES[4] as number, TIMES[6] as number]) {
      setTimeout(() => {
        const r = spot.getBoundingClientRect()
        const c = { x: r.left, y: r.top }
        ring(c, 'rgba(255,255,255,.55)', size * (t < 0.5 ? 1.5 : 1.1), 320)
        if (t < 0.5) sparks(c, '#ffe9a8', 6, 0.45)
        // Arrêtée : un éclat sur la face gagnante.
        if (t > 0.85 && kind === 'coin') {
          flash(c, '#fff3c4', size * 2.2, 420)
          sparks(c, '#ffd24a', 10, 0.8)
        }
        if (t < 0.5) shake(table, 4)
      }, delay + duration * t)
    }
  })
  await Promise.all(jobs)
}

/** Coup de marteau d'un texte de puissance : il tombe de très haut, s'écrase, rebondit, et déclenche rayons, onde de choc, étincelles et secousse. */
async function slam(el: HTMLElement, strength = 1, duration = 900): Promise<void> {
  const text = el.querySelector<HTMLElement>('.power-text') as HTMLElement
  const rays = el.querySelector<HTMLElement>('.power-rays') as HTMLElement
  const wave = el.querySelector<HTMLElement>('.power-ring') as HTMLElement
  const impact = 0.36
  setTimeout(() => {
    const c = centerOf(el.getBoundingClientRect())
    const scale = 260 * strength
    flash(c, '#ffffff', scale * 2.2, 420)
    ring(c, '#fff3c4', scale * 2.6, 720)
    sparks(c, '#ffd24a', Math.round(34 * strength), 1.5 * strength)
    shake(arena(), 16 * strength)
    sfx(strength >= 1 ? 'directattack' : 'attack', { gap: 0 })
    void play(rays, [{ opacity: 0, transform: 'scale(.3) rotate(0deg)' }, { opacity: 0.95, transform: 'scale(.8) rotate(25deg)', offset: 0.25 }, { opacity: 0.45, transform: 'scale(1.15) rotate(80deg)' }], { duration: 1500, easing: 'ease-out', fill: 'forwards' })
    void play(wave, [{ opacity: 1, transform: 'scale(.25)' }, { opacity: 0, transform: 'scale(2.7)' }], { duration: 760, easing: EASE_OUT, fill: 'forwards' })
  }, duration * impact)
  await play(
    text,
    [
      { transform: 'scale(4.2) rotate(-7deg)', opacity: 0, filter: 'blur(12px) drop-shadow(0 0 20px #fff)', offset: 0 },
      { opacity: 1, offset: 0.16 },
      { transform: 'scale(.82) rotate(1.5deg)', opacity: 1, filter: 'blur(0) drop-shadow(0 0 30px #fff)', offset: impact },
      { transform: 'scale(1.16) rotate(-1deg)', offset: 0.55 },
      { transform: 'scale(.96)', offset: 0.72 },
      { transform: 'scale(1)', opacity: 1, offset: 1 },
    ],
    { duration, easing: 'cubic-bezier(.3,.1,.3,1)', fill: 'forwards' },
  )
}

interface Count {
  text: string
  tint: Tint
  size: number
  strength: number
  /** Texte de puissance ou petite pastille entre deux (« + »). */
  quiet?: boolean
}

/**
 * Affiche une suite de textes de puissance qui tombent l'un après l'autre. `sub` s'écrit dessous à la fin.
 * `quick` : les petits chiffres intermédiaires tombent plus vite, l'annonce finale reste complète.
 */
async function showRows(at: Pt, rows: Count[][], sub: string, quick: boolean): Promise<HTMLElement> {
  const host = node('throw-count', `left:${at.x}px;top:${at.y}px;`)
  render(
    <>
      {rows.map((row, r) => (
        <div class="throw-chips" key={r}>
          {row.map((c, i) => (
            <PowerText key={i} text={c.text} tint={c.tint} size={c.size} class={c.quiet ? 'quiet' : ''} />
          ))}
        </div>
      ))}
      <p class="throw-sub" style="opacity:0">
        {sub}
      </p>
    </>,
    host,
  )
  // Tout est caché tant que ce n'est pas son tour de tomber.
  const powers = [...host.querySelectorAll<HTMLElement>('.power')]
  for (const p of powers) (p.querySelector('.power-text') as HTMLElement).style.opacity = '0'
  const flat = rows.flat()
  for (let i = 0; i < powers.length; i++) {
    const c = flat[i] as Count
    ;(powers[i]?.querySelector('.power-text') as HTMLElement).style.opacity = ''
    if (c.quiet) {
      void play(powers[i] as HTMLElement, [{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 160, easing: EASE_OUT, fill: 'forwards' })
      await sleep(120)
    } else if (quick && i < powers.length - 1) {
      // Chiffre intermédiaire : tombé sec et rapide, on enchaîne aussitôt.
      await slam(powers[i] as HTMLElement, c.strength * 0.7, 260)
      await sleep(30)
    } else {
      await slam(powers[i] as HTMLElement, c.strength)
      await sleep(i === powers.length - 1 ? 0 : 90)
    }
  }
  const subEl = host.querySelector<HTMLElement>('.throw-sub')
  if (subEl && sub) void play(subEl, [{ opacity: 0, transform: 'translateY(14px) scale(.9)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: EASE_OUT, fill: 'forwards' })
  return host
}

async function throwAll(kind: 'dice' | 'coin', values: number[], rows: Count[][] | ((size: number, h: number) => Count[][]), sub: string, at: Pt, announce = false): Promise<void> {
  const a = arena().getBoundingClientRect()
  const w = Math.min(a.width * 0.94, 840)
  const h = Math.min(innerHeight * 0.5, 400)
  const size = Math.max(52, Math.min(h * 0.36, 118, (w * 0.8) / Math.max(values.length, 1) / 1.3))
  const n = values.length
  const spots: Spot[] = values.map((_, i) => ({ x: (w * (i + 1)) / (n + 1) + rand(-12, 12), y: h * 0.5 + rand(-h * 0.1, h * 0.1), rest: rand(-16, 16) }))

  const table = node('fx-table', `left:${at.x}px;top:${at.y}px;`)
  render(<Table kind={kind} values={values} size={size} w={w} h={h} spots={spots} />, table)
  const surface = table.querySelector('.throw-table') as HTMLElement
  // Le tapis se déploie pendant qu'on jette : les objets sont déjà au bord (état de départ des animations), jamais à leur place finale.
  const rolling = tumble(surface, kind, values, size, spots, kind === 'dice' ? 1450 : 1650)
  await play(table, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(.82)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' }], { duration: 260, easing: EASE_OUT, fill: 'forwards' })
  await rolling

  // Les dés sont à l'arrêt : un court silence, le tapis s'assombrit à peine (le texte doit rester brillant dessus), puis le compte tombe.
  await sleep(280)
  void play(surface, [{ filter: 'brightness(1)' }, { filter: 'brightness(.72)' }], { duration: 240, fill: 'forwards' })
  const count = await showRows(at, typeof rows === 'function' ? rows(size, h) : rows, sub, announce)
  await sleep(announce ? 500 : 1100)
  await Promise.all([play(count, [{ opacity: 1 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1.25)', filter: 'blur(6px)' }], { duration: 380, easing: 'ease-in', fill: 'forwards' }), play(table, [{ opacity: 1 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(.9)' }], { duration: 380, easing: 'ease-in', fill: 'forwards' })])
  render(null, table)
  table.remove()
  count.remove()
}

export async function rollDice(at: Pt, results: number[], quick = false): Promise<void> {
  const total = results.reduce((t, r) => t + r, 0)
  const n = results.length
  const max = results.every((r) => r === 6)
  const same = n > 1 && results.every((r) => r === results[0])
  const sub = max ? t('fx.dice.max') : same ? (n === 2 ? t('fx.dice.double') : t('fx.dice.same', { n })) : n > 1 ? t('fx.dice.n', { n }) : t('fx.dice.one')
  const tint: Tint = max ? 'fire' : 'gold'
  await throwAll(
    'dice',
    results,
    (size, h) => {
      const big = Math.min(h * 0.62, 250)
      if (n === 1) return [[{ text: String(total), tint, size: big, strength: 1.1 }]]
      // Chaque dé annonce sa valeur en gros, puis le total tombe, encore plus gros.
      const row: Count[] = results.flatMap((r, i): Count[] => [...(i ? [{ text: '+', tint: 'silver' as Tint, size: size * 0.5, strength: 0.4, quiet: true }] : []), { text: String(r), tint: 'silver' as Tint, size: Math.min(size * 1.15, h * 0.24), strength: 0.55 }])
      return [row, [{ text: String(total), tint, size: big * 0.92, strength: 1.2 }]]
    },
    sub,
    at,
    quick,
  )
}

/** Une pièce par résultat : true = Face, false = Pile. */
export async function flipCoins(at: Pt, results: boolean[], quick = false): Promise<void> {
  const heads = results.filter(Boolean).length
  const tails = results.length - heads
  const sub = results.length > 1 ? t('fx.coin.n', { n: results.length }) : t('fx.coin.one')
  await throwAll(
    'coin',
    results.map((r) => (r ? 1 : 0)),
    (_size, h) => {
      // Une ligne par résultat (Face, puis Pile) : chacune tombe à son tour, assez petite pour tenir sur le tapis.
      const big = Math.min(h * (heads && tails ? 0.3 : 0.5), innerWidth * 0.075)
      const rows: Count[][] = []
      if (heads) rows.push([{ text: heads > 1 ? t('fx.heads_n', { n: heads }) : t('fx.heads'), tint: 'gold', size: big, strength: 1.05 }])
      if (tails) rows.push([{ text: tails > 1 ? t('fx.tails_n', { n: tails }) : t('fx.tails'), tint: 'silver', size: big, strength: 1.05 }])
      return rows
    },
    sub,
    at,
    quick,
  )
}
