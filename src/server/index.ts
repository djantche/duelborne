import { msg as ref } from '../shared/msg.ts'
import os from 'node:os'
import { WebSocketServer } from 'ws'
import { parseClientMessage } from '../shared/protocol.ts'
import { importLegacyDecks } from './accounts/legacy.ts'
import { createApi } from './api/index.ts'
import { createHttpServer } from './http.ts'
import { FormatCatalog } from './formats/catalog.ts'
import { listsAreStale, syncLists } from './formats/sync.ts'
import { Hub } from './hub.ts'
import { loadData, missingData } from './ocg/data.ts'
import { loadDecks } from './ocg/decks.ts'
import { createServices } from './services.ts'
import { openStorage } from './store/index.ts'

const PORT = Number(process.env.PORT ?? 3000)
const PROD = process.argv.includes('--prod')

/** Adresses de cette machine : une connexion venant de l'une d'elles est celle de l'hôte, pas d'un autre appareil du LAN. */
const HOST_ADDRESSES = new Set(['127.0.0.1', '::1', ...Object.values(os.networkInterfaces()).flatMap((a) => (a ?? []).map((i) => i.address))])
const isHost = (address: string | undefined): boolean => !!address && HOST_ADDRESSES.has(address.replace(/^::ffff:/, ''))

async function main(): Promise<void> {
  const missing = missingData()
  if (missing) throw new Error(missing)
  const { cards } = loadData()
  const provided = loadDecks()
  console.log(`${cards} cartes chargées, ${provided.size} decks disponibles.`)
  if (!provided.size) throw new Error('Aucun deck dans decks/. Lance : npm run build-decks')

  // Base des joueurs : comptes, decks personnels, historique, tournois (save/duel-lan.sqlite).
  const storage = openStorage()
  if (storage.migrated.to > storage.migrated.from) {
    console.log(`Base des joueurs mise à jour (version ${storage.migrated.from} → ${storage.migrated.to})${storage.migrated.backup ? ` ; sauvegarde : ${storage.migrated.backup}` : ''}.`)
  }
  const legacy = importLegacyDecks(storage)
  if (legacy) console.log(`${legacy.imported} ancien(s) deck(s) de decks/user/ copié(s) dans la base${legacy.renamed ? ` (${legacy.renamed} renommé(s) : nom en double)` : ''}. Copie de sécurité : ${legacy.backup}. Le premier compte créé sur cet ordinateur peut les récupérer depuis « Mon Deck ».`)

  const formats = new FormatCatalog().load()
  for (const f of formats.infos()) if (f.status === 'missing') console.log(`Format « ${f.id} » : aucune liste, il n’est pas proposé (npm run sync-lists).`)
  // Les listes TCG / OCG / GOAT se resynchronisent d'elles-mêmes quand elles ont plus de 7 jours ; hors ligne, la liste installée reste.
  if (process.env.DUEL_NO_SYNC !== '1' && listsAreStale()) {
    void syncLists().then((results) => {
      for (const r of results) console.log(`Liste « ${r.id} » : ${r.status === 'updated' ? `synchronisée (${r.detail})` : r.status === 'kept' ? r.detail : `synchronisation impossible (${r.detail}), liste installée conservée`}.`)
      if (results.some((r) => r.status === 'updated')) formats.load()
    }).catch((e) => console.warn('[formats] synchronisation abandonnée :', e))
  }
  const services = createServices(storage, provided, formats)
  const hub = new Hub(services)
  const api = createApi(services, hub, (req) => isHost(req.socket.remoteAddress))
  const httpServer = await createHttpServer(PROD, api)

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 })
  httpServer.on('upgrade', (req, socket, head) => {
    if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/ws') return // laisse Vite gérer son HMR
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  })

  wss.on('connection', (ws, req) => {
    const conn = hub.connect(ws, isHost(req.socket.remoteAddress))
    ws.on('message', (data) => {
      const msg = parseClientMessage(data.toString())
      if (!msg) return void ws.send(JSON.stringify({ t: 'error', message: ref('err.invalid') }))
      try {
        conn.message(msg)
      } catch (e) {
        console.error(e)
        ws.send(JSON.stringify({ t: 'error', message: ref('err.internal') }))
      }
    })
    ws.on('close', () => conn.close())
  })

  // Sans ce gestionnaire, un port occupé ou réservé (plages exclues de Windows) arrête Node avec une simple pile d'appels.
  httpServer.once('error', (e: NodeJS.ErrnoException) => {
    const reason = e.code === 'EADDRINUSE' ? 'déjà utilisé par un autre programme'
      : e.code === 'EACCES' ? 'interdit ou réservé par le système (sous Windows : netsh interface ipv4 show excludedportrange protocol=tcp) ; choisir un autre port avec PORT=…'
      : e.message
    console.error(`Port ${PORT} indisponible (${e.code ?? 'erreur'}) : ${reason}.`)
    storage.close()
    process.exit(1)
  })
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`\nServeur ${PROD ? 'de production' : 'de développement'} lancé. Ouvre dans le navigateur :`)
    console.log(`  Cet ordinateur : http://localhost:${PORT}`)
    for (const addrs of Object.values(os.networkInterfaces())) {
      for (const a of addrs ?? []) if (a.family === 'IPv4' && !a.internal) console.log(`  Autres appareils (LAN) : http://${a.address}:${PORT}`)
    }
  })

  // Arrêt propre : la base est fermée (journal vidé) avant de quitter.
  const stop = (): void => {
    storage.close()
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
