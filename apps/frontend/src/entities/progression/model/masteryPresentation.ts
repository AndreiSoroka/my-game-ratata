import { type MasterySnapshot, parseMasteryExperience } from '@my-game-ratata/contracts'

import { formatGameNumber, gameLocale } from '@/shared/lib/i18n'

export function displayMasteryExperience(value: string): string {
    const micros = parseMasteryExperience(value)
    const cents = (micros + 5000n) / 10000n
    const whole = formatGameNumber(cents / 100n)
    const fraction = (cents % 100n).toString().padStart(2, '0').replace(/0+$/, '')
    return fraction ? `${whole}${gameLocale.value === 'ru' ? ',' : '.'}${fraction}` : whole
}
export function masteryProgressPercent(mastery: MasterySnapshot): number {
    const maximum = parseMasteryExperience(mastery.experienceToNext)
    return maximum > 0n
        ? Number((parseMasteryExperience(mastery.experience) * 10000n) / maximum) / 100
        : 0
}
