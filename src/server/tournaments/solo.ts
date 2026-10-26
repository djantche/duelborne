// File des duels entre ordinateurs des tournois solo. Les résultats viennent des mêmes salles et du même moteur que les matchs du joueur
// (aucune victoire n'est tirée au sort). L'IA réfléchit en temps réel : plusieurs duels se jouent en parallèle, chacun dans un thread
// à part (botworker.ts), pour ne pas ralentir le serveur ni les duels des joueurs.
import os from 'node:os'
import { Worker } from 'node:worker_threads'
import type { AiLevel } from '../../shared/protocol.ts'
import type { DuelResult, RoomTournament } from '../room.ts'
import type { WorkerReply, WorkerRequest } from './botworker.ts'
import type { Session } from '../session.ts'
import { TournamentSpectators } from './spectator.ts'

/** Durée maximale d'un duel entre ordinateurs, selon leur niveau (l'IA experte réfléchit plus longtemps). Au-delà, il est abandonné et le joueur peut le relancer. */
export const BOT_MATCH_LIMIT_MS: Record<AiLevel, number> = { easy: 20 * 60_000, normal: 40 * 60_000, hard: 90 * 60_000 }

/** Nombre de duels entre ordinateurs joués en même temps : on laisse de la place au serveur et aux joueurs. */
export const botConcurrency = (cores: number = os.availableParallelism()): number => Math.max(1, Math.min(3, cores - 2))

interface Job {
  id: number
  tournament: string
  matchId: string
  timer: ReturnType<typeof setTimeout>
  worker: Worker
  spectators: TournamentSpectators
}

export class SoloTournamentQueue {
  /** Tournois dont des matchs entre ordinateurs restent peut-être à jouer. */
  private readonly pending = new Set<string>()
  private readonly failed = new Set<string>()
  private readonly jobs = new Map<number, Job>()
  private readonly idle: Worker[] = []
  private readonly limit: number
  private counter = 0
  private scheduled = false
  private readonly next: (id: string, running: ReadonlySet<string>) => RoomTournament | null
  private readonly finished: (result: DuelResult) => void
  private readonly changed: (id: string) => void

  constructor(next: (id: string, running: ReadonlySet<string>) => RoomTournament | null, finished: (result: DuelResult) => void, changed: (id: string) => void, limit: number = botConcurrency()) {
    this.next = next
    this.finished = finished
    this.changed = changed
    this.limit = limit
  }

  hasError(id: string): boolean { return this.failed.has(id) }

  watchable(matchId: string): boolean { return [...this.jobs.values()].some((j) => j.matchId === matchId && j.spectators.watchable) }

  watch(matchId: string, session: Session): boolean {
    return [...this.jobs.values()].find((j) => j.matchId === matchId)?.spectators.watch(session) ?? false
  }

  /** Un match entre ordinateurs de ce tournoi se joue en ce moment. */
  progress(id: string): { matchId: string } | null {
    for (const job of this.jobs.values()) if (job.tournament === id) return { matchId: job.matchId }
    return null
  }

  enqueue(id: string): void {
    this.failed.delete(id)
    this.pending.add(id)
    this.schedule()
  }

  /** Un match est annulé (forfait, tournoi supprimé) : s'il se joue, on l'arrête. */
  cancel(matchId: string): void {
    for (const job of this.jobs.values()) if (job.matchId === matchId) this.release(job, true)
  }

  private running(): Set<string> { return new Set([...this.jobs.values()].map((j) => j.matchId)) }

  private schedule(): void {
    if (this.scheduled || !this.pending.size) return
    this.scheduled = true
    setImmediate(() => { this.scheduled = false; this.pump() })
  }

  private pump(): void {
    for (const tournament of [...this.pending]) {
      // Un tournoi peut avoir plusieurs matchs prêts : on en lance autant que la place le permet.
      while (this.jobs.size < this.limit) {
        let spec: RoomTournament | null = null
        try {
          spec = this.next(tournament, this.running())
        } catch (e) {
          console.error('[tournoi solo]', e)
          this.pending.delete(tournament)
          this.failed.add(tournament)
          this.changed(tournament)
          break
        }
        if (!spec) {
          // Plus rien à lancer pour lui : il sera réinscrit à la fin d'un de ses duels.
          if (![...this.jobs.values()].some((j) => j.tournament === tournament)) this.pending.delete(tournament)
          break
        }
        this.start(tournament, spec)
      }
      if (this.jobs.size >= this.limit) return
    }
  }

  private worker(): Worker {
    const worker = this.idle.pop() ?? this.spawn()
    return worker
  }

  private spawn(): Worker {
    const worker = new Worker(new URL('./botworker.ts', import.meta.url))
    worker.on('message', (m: WorkerReply) => this.reply(worker, m))
    worker.on('error', (e) => { console.error('[tournoi solo]', e); this.died(worker) })
    worker.on('exit', () => this.died(worker))
    // Un thread qui reste en vie ne doit pas empêcher le serveur de s'arrêter.
    worker.unref()
    return worker
  }

  private start(tournament: string, spec: RoomTournament): void {
    const worker = this.worker()
    const id = ++this.counter
    const limit = BOT_MATCH_LIMIT_MS[spec.bots?.find(Boolean) ?? 'normal']
    const job: Job = { id, tournament, matchId: spec.matchId, worker, spectators: new TournamentSpectators(spec, (count) => { if (this.jobs.get(id) === job) worker.postMessage({ t: 'watched', job: id, watched: count > 0 } satisfies WorkerRequest) }), timer: setTimeout(() => { console.error('[tournoi solo] duel trop long, abandonné'); this.release(job, true); this.fail(tournament) }, limit) }
    this.jobs.set(id, job)
    worker.postMessage({ t: 'run', job: id, spec } satisfies WorkerRequest)
    this.changed(tournament)
  }

  /** Libère un duel : le thread est arrêté (annulation, délai dépassé) ou remis au repos. */
  private release(job: Job, abort: boolean): void {
    clearTimeout(job.timer)
    this.jobs.delete(job.id)
    if (abort) {
      job.spectators.close()
      // Le thread peut être englué dans une réflexion : on le remplace plutôt que d'attendre.
      void job.worker.terminate()
    } else {
      this.idle.push(job.worker)
      // Les spectateurs gardent quelques secondes la scène finale avant de revenir au tournoi.
      setTimeout(() => job.spectators.close(), 8000).unref()
    }
    this.schedule()
  }

  private reply(worker: Worker, m: WorkerReply): void {
    if (m.t === 'ready') return
    const job = this.jobs.get(m.job)
    if (!job || job.worker !== worker) return
    if (m.t === 'public') {
      const wasWatchable = job.spectators.watchable
      job.spectators.push(m.state)
      if (wasWatchable !== job.spectators.watchable) this.changed(job.tournament)
      return
    }
    if (m.t === 'failed') {
      this.release(job, true)
      return this.fail(job.tournament)
    }
    this.release(job, false)
    try {
      this.finished(m.result)
      this.pending.add(job.tournament)
    } catch (e) {
      console.error('[tournoi solo]', e)
      this.fail(job.tournament)
    }
    this.schedule()
  }

  private died(worker: Worker): void {
    const at = this.idle.indexOf(worker)
    if (at >= 0) this.idle.splice(at, 1)
    for (const job of this.jobs.values()) {
      if (job.worker !== worker) continue
      this.release(job, true)
      this.fail(job.tournament)
    }
  }

  private fail(tournament: string): void {
    this.failed.add(tournament)
    this.pending.delete(tournament)
    this.changed(tournament)
  }
}
