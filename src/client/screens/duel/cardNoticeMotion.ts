export const CARD_NOTICE_MOTION = { enter: 120, read: 560, leave: 150 } as const
export const CARD_NOTICE_DURATION = CARD_NOTICE_MOTION.enter + CARD_NOTICE_MOTION.read + CARD_NOTICE_MOTION.leave
