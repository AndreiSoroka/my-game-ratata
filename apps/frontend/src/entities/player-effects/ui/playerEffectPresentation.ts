import { ROAD_PRAYER_RULES } from '@my-game-ratata/contracts'

import type { PlayerEffect, PlayerEffectKind } from '../model/playerEffects'

const presentation: Record<
    PlayerEffectKind,
    { label: string; path: string; tone?: 'warning' | 'positive' }
> = {
    'theft-cooldown': {
        label: 'Кража',
        path: 'M5 1h2v1h2v1h1v2h1v4H9v1h1v1H2v-1h1V9H1V5h1V3h1V2h2z M4 4h4v1h1v2H8v1H4V7H3V5h1z M4 5h1v1H4z M7 5h1v1H7z',
    },
    wanted: {
        label: 'Розыск',
        path: 'M5 1h2v1h2v2h1v4h1v1H1V8h1V4h1V2h2z M5 10h2v1H5z M5 3H4v1H3v4h6V4H8V3H7V2H5z',
        tone: 'warning',
    },
    blacklisted: {
        label: 'В чёрном списке Новогорода',
        path: 'M1 2h3v1h1v1h2V3h1V2h3v7H8v1H7v1H5v-1H4V9H1z M2 3v5h2v1h1V5H4V4H3V3z M10 3H9v1H8v1H7v4h1V8h2z M3 6h1v1H3z M8 6h1v1H8z',
        tone: 'warning',
    },
    stun: {
        label: 'Оглушение',
        path: 'M5 1h2v3h3v1H9v1H8v4H7V9H5v1H4V6H3V5H2V4h3z M1 1h1v1H1z M10 2h1v1h-1z M1 8h1v1H1z M10 9h1v1h-1z',
        tone: 'warning',
    },
    barrier: {
        label: 'Магический барьер',
        path: 'M1 2h10v5h-1v2H8v1H7v1H5v-1H4V9H2V7H1z M2 3v4h1v1h2v1h2V8h2V7h1V3z M5 4h2v3H5z',
        tone: 'positive',
    },
    chains: {
        label: 'Оковы',
        path: 'M1 2h4v1h1v2h2v1h3v4H7V9H6V7H4V6H1z M2 3v2h2V3z M8 7v2h2V7z M4 4l4 4 1-1-4-4z',
        tone: 'warning',
    },
    'defensive-stance': {
        label: 'Защитная стойка',
        path: 'M1 2h10v5h-1v2H8v1H7v1H5v-1H4V9H2V7H1z M3 4v2h1v1h1v1h2V7h1V6h1V4H8v2H7v1H5V6H4V4z',
        tone: 'positive',
    },
    'blade-combo': {
        label: 'Серия ударов',
        path: 'M8 1h3v3h-1v1H9v1H8v1H7v1H6v1H5v1H4v1H1V8h1V7h1V6h1v1h1V6h1V5h1V4h1z',
        tone: 'positive',
    },
    sneaking: {
        label: 'Скрытность',
        path: 'M1 5h1V4h2V3h4v1h2v1h1v2h-1v1H8v1H4V8H2V7H1z M3 5v2h2v1h2V7h2V5H7v1H5V5z',
    },
    dashing: {
        label: 'Рывок',
        path: 'M7 1h1v1h1v1h1v1h1v3h-1v1H9v1H8v1H7V8h1V7H2V5h6V4H7z M1 2h4v1H1z M1 9h4v1H1z',
    },
    'road-prayer-dash': {
        label: `Подставить плечо · следующий рывок −${ROAD_PRAYER_RULES.dashDiscount} EN`,
        path: 'M6 1h2v2H6z M4 4h4v1h2v1H7v1h2v4H8V8H6V7H5v2H4v1H1V9h2V7h1V5H2v1H1V5h1V4z',
        tone: 'positive',
    },
    weakened: {
        label: 'Ослабление',
        path: 'M8 1h3v3h-1v1H9v1H8V5H7V4h1z M6 5h1v2H6v1H5v1H4v1H3v1H1V9h1V8h1V7h1v1h1V7h1z',
        tone: 'warning',
    },
    slowed: {
        label: 'Замедление',
        path: 'M2 1h8v2H9v2H8v2h1v2h1v2H2V9h1V7h1V5H3V3H2z M4 3v1h1v1h2V4h1V3z M4 9h4V8H7V7H5v1H4z',
        tone: 'warning',
    },
    feared: {
        label: 'Страх',
        path: 'M4 1h4v1h2v2h1v7H9v-1H8v1H6v-1H5v1H3v-1H1V4h1V2h2z M3 4h2v2H3z M7 4h2v2H7z M5 8h2V7H5z',
        tone: 'warning',
    },
    'prayer-protection': {
        label: 'Защита молитвы',
        path: 'M1 2h10v5h-1v2H8v1H7v1H5v-1H4V9H2V7H1z M5 3v2H3v2h2v2h2V7h2V5H7V3z',
        tone: 'positive',
    },
    'prayer-blessing': {
        label: 'Благословение',
        path: 'M5 1h2v2h1v1h1v1h2v2H9v1H8v1H7v2H5V9H4V8H3V7H1V5h2V4h1V3h1z',
        tone: 'positive',
    },
    'prayer-vulnerability': {
        label: 'Уязвимость',
        path: 'M1 2h5v2H5v2h1v1H5v3H4V9H2V7H1z M7 2h4v5h-1v2H8v1H6V8h1V7H6V5h1z',
        tone: 'warning',
    },
    'road-prayer-recovery': {
        label: `Походная песня · восстановление EN ×${ROAD_PRAYER_RULES.energyRegenMultiplier}`,
        path: 'M5 1h6v2H7v6H6v1H3V9H2V7h1V6h2z M9 5h2v1H9z M9 8h2v1H9z',
        tone: 'positive',
    },
}

export function presentPlayerEffects(effects: readonly PlayerEffect[]) {
    return effects
        .filter(({ remainingMs }) => remainingMs === undefined || remainingMs > 0)
        .map((effect) => {
            const { label, path, tone } = presentation[effect.kind]
            const stacks =
                effect.stacks !== undefined && effect.stackLimit !== undefined
                    ? `${effect.stacks}/${effect.stackLimit}`
                    : undefined
            const timer = effectTimer(effect)
            const text = [label, stacks, timer].filter(Boolean).join(' · ')
            return { kind: effect.kind, path, tone, stacks, timer, text }
        })
}

function effectTimer({ kind, remainingMs }: PlayerEffect): string | undefined {
    if (remainingMs === undefined) return undefined
    const seconds =
        kind === 'stun' ? Math.ceil(remainingMs / 100) / 10 : Math.ceil(remainingMs / 1000)
    return `${seconds.toLocaleString('ru-RU')} с`
}
