import type { GameEventPayload } from '@my-game-ratata/contracts'

import { tLocalized } from '@/shared/lib/i18n'

import type { RatataGameOptions } from './runtimeOptions'
import { isFloatingNotice, isNoticeForPlayer } from './runtimeQueries'

export function isLocalDeath(event: GameEventPayload, playerId: string | undefined): boolean {
    return (
        playerId !== undefined &&
        ((event.kind === 'death' && event.targetId === playerId) ||
            (event.kind === 'permadeath' && event.actorId === playerId))
    )
}

export function runtimeEventFeedback(
    event: GameEventPayload,
    playerId: string | undefined,
    options: Pick<RatataGameOptions, 'onNotice' | 'onDefeat'>,
    releaseInputs: () => void
): void {
    if (isNoticeForPlayer(event, playerId) && !isFloatingNotice(event))
        options.onNotice?.(tLocalized(event.textMessage, event.text))
    if (event.kind === 'permadeath' && event.actorId === playerId) {
        releaseInputs()
        options.onDefeat?.()
    }
}
