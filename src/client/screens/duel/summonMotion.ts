export const SUMMON_MOTION = { enter: 420, read: 1200, leave: 300 } as const
export const SUMMON_DURATION = SUMMON_MOTION.enter + SUMMON_MOTION.read + SUMMON_MOTION.leave
