// Durées à ×1 de la scène Fusion, aussi utilisées par les estimations des replays.
export const FUSION_MOTION = { enter: 280, read: 420, swirl: 860, unfold: 440, reveal: 460, land: 560, fade: 200 } as const
export const FUSION_DURATION = Object.values(FUSION_MOTION).reduce((sum, value) => sum + value, 0)
