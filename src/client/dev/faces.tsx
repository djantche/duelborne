// Outil de test (hors application) : les six faces du dé et les deux côtés de la pièce, posés côte à côte (chargé seulement par tools/visual/scenes.mjs : l'application ne l'importe pas).
import { render } from 'preact'
import { Coin, Die } from '../ui/Dice3D.tsx'

export function showFaces(): void {
  const box = document.createElement('div')
  box.id = 'dicefaces'
  box.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:90;padding:40px;background:rgba(6,8,20,.9);border-radius:16px;--s:90px'
  document.body.appendChild(box)
  render(
    <div style="display:flex;gap:44px;align-items:center">
      {[1, 2, 3, 4, 5, 6].map((v) => (
        <Die value={v} />
      ))}
      <Coin heads />
      <Coin heads={false} />
    </div>,
    box,
  )
}
