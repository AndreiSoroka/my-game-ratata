import type { GameLocale } from '@my-game-ratata/contracts'

import type { HeardSocialReaction } from './societyDialogue'

export type SpeechWarningTrigger = 'insult' | 'threat'

const openings = {
    ru: {
        insult: ['Не оскорбляй меня.', 'Выбирай выражения.'],
        threat: ['Держись подальше.', 'Не угрожай мне.'],
    },
    en: {
        insult: ['Do not insult me.', 'Mind your words.'],
        threat: ['Keep your distance.', 'Do not threaten me.'],
    },
} as const

export function speechWarningTrigger(
    reaction: HeardSocialReaction | undefined
): SpeechWarningTrigger | undefined {
    return reaction?.action === 'warn' &&
        (reaction.trigger === 'insult' || reaction.trigger === 'threat')
        ? reaction.trigger
        : undefined
}

export function warningOpenings(
    trigger: SpeechWarningTrigger,
    language: GameLocale
): readonly [string, string] {
    return openings[language][trigger]
}

export function opensWithWarning(
    text: string | null,
    trigger: SpeechWarningTrigger,
    language: GameLocale
): boolean {
    const line = text?.trim() ?? ''
    return warningOpenings(trigger, language).some(
        (opening) =>
            line === opening ||
            (line.startsWith(opening) &&
                /\s/u.test(line.charAt(opening.length)))
    )
}
