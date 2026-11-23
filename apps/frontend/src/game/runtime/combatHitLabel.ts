import type { CombatHitQuality, GameEventPayload } from '@my-game-ratata/contracts'

import { gameLocale, tGame } from '@/shared/lib/i18n'

export const hitColors: Record<CombatHitQuality, string> = {
    miss: '#a7a7a7',
    weak: '#a7a7a7',
    normal: '#ffe8a4',
    strong: '#ffad4a',
    critical: '#ff5858',
}
export function hitQuality(event: GameEventPayload): CombatHitQuality {
    return event.hitQuality ?? (event.critical ? 'critical' : 'normal')
}
export function combatHitLabel(event: GameEventPayload): string {
    return typeof event.amount === 'number' && Number.isFinite(event.amount) && event.amount > 0
        ? `−${event.amount.toLocaleString(gameLocale.value, { maximumFractionDigits: 2 })}`
        : tGame(`game.canvas.${hitQuality(event)}`)
}
