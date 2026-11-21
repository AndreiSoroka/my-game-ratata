import type { GameEventPayload } from '@my-game-ratata/contracts'

import type { RatataGameOptions } from './runtimeOptions'
import { isNoticeForPlayer } from './runtimeQueries'

export function runtimeEventFeedback(
    event: GameEventPayload,
    playerId: string | undefined,
    options: Pick<RatataGameOptions, 'onNotice' | 'onDefeat'>,
    releaseInputs: () => void
): void {
    if (event.noticeKind !== 'dash_rejected' && isNoticeForPlayer(event, playerId))
        options.onNotice?.(event.text)
    if (event.kind === 'permadeath' && event.actorId === playerId) {
        releaseInputs()
        options.onDefeat?.()
    }
}
