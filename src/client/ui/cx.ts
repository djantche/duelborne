/** Assemble des noms de classes CSS en ignorant les valeurs vides : `cx('btn', primary && 'primary')`. */
export const cx = (...parts: (string | false | null | undefined)[]): string => parts.filter(Boolean).join(' ')
