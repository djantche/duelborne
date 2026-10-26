// La page sortante est une copie visuelle, jamais une seconde simulation de ses animations.
// Désactiver ses animations CSS sans conserver leur état remettrait les cartes et menus
// à leur position de repos avant la fin du fondu.
const FRAME_PROPERTIES = ['transform', 'translate', 'rotate', 'scale', 'opacity', 'filter', 'background-position'] as const

export function mountPageSnapshot(page: HTMLElement): HTMLElement {
  const copy = page.cloneNode(true) as HTMLElement
  const sources = [page, ...page.querySelectorAll('*')]
  const copies = [copy, ...copy.querySelectorAll('*')]
  for (let i = 0; i < sources.length; i++) {
    const target = copies[i]
    target?.removeAttribute('id')
    if (!(target instanceof HTMLElement || target instanceof SVGElement)) continue
    const frame = getComputedStyle(sources[i]!)
    for (const property of FRAME_PROPERTIES) target.style.setProperty(property, frame.getPropertyValue(property))
  }
  // Le fondu anime son propre conteneur : il ne remplace pas la transformation figée de la page.
  const snapshot = document.createElement('div')
  snapshot.className = 'route-snapshot'
  snapshot.setAttribute('inert', '')
  snapshot.setAttribute('aria-hidden', 'true')
  snapshot.append(copy)
  document.body.append(snapshot)
  // cloneNode ne conserve pas le défilement ; le restaurer une fois la copie mise en page.
  for (let i = 0; i < sources.length; i++) {
    copies[i]!.scrollTop = sources[i]!.scrollTop
    copies[i]!.scrollLeft = sources[i]!.scrollLeft
  }
  return snapshot
}
