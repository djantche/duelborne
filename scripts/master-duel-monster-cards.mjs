// Correspondances reproductibles entre les noms des images Yugipedia et les cartes locales.
// Pas de rapprochement approximatif : une correspondance doit être unique après normalisation.
const normalize = (name) => name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '')

export function associateCards(files, cards) {
  if (!Array.isArray(cards) || cards.some((card) => !Number.isSafeInteger(card.id) || card.id <= 0 || typeof card.name?.en !== 'string')) {
    throw new Error('data/cards.json : liste de cartes invalide.')
  }
  const names = new Map()
  for (const card of cards) {
    const key = normalize(card.name.en)
    if (!names.has(key)) names.set(key, [])
    names.get(key).push(card)
  }
  const byCard = {}
  const unmatched = []
  const associated = files.map((entry) => {
    // Certains fichiers du wiki ont deux points avant l’extension ; le nom original est conservé.
    const parts = entry.filename.match(/^(.*)-MADU-([a-z]{2})-VG-NC(?:-(\d+))?\.+[a-z0-9]+$/i)
    const candidates = parts ? names.get(normalize(parts[1])) ?? [] : []
    const card = candidates.length === 1 ? candidates[0] : null
    const localPath = `images/master-duel-monsters/${entry.filename}`
    const file = {
      ...entry, path: localPath, cardId: card?.id ?? null, cardName: card?.name ?? null,
      language: parts?.[2].toUpperCase() ?? null, variant: parts ? Number(parts[3] ?? 1) : null,
    }
    if (card) {
      byCard[card.id] ??= { id: card.id, name: card.name, images: [] }
      byCard[card.id].images.push({
        path: localPath, filename: entry.filename, language: file.language, variant: file.variant,
      })
    } else {
      unmatched.push({
        filename: entry.filename,
        reason: candidates.length ? 'ambiguous-name' : 'no-matching-name',
        candidates: candidates.map((candidate) => ({ id: candidate.id, name: candidate.name.en })),
      })
    }
    return file
  })
  for (const card of Object.values(byCard)) {
    // L’illustration EN originale d’abord ; toutes les variantes restent accessibles.
    card.images.sort((a, b) => Number(b.language === 'EN') - Number(a.language === 'EN')
      || a.variant - b.variant || a.filename.localeCompare(b.filename, 'en'))
    card.preferred = card.images[0].path
  }
  return { files: associated, byCard, unmatched }
}
