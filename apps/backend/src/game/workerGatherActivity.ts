import type { MarketSnapshot } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { recordWorkerActivity } from './workerActivityState'

export function recordGatherPause(
    actor: GameCharacter,
    kinds: string[],
    market: MarketSnapshot | undefined,
    nextWorkAt: ReadonlyMap<string, number>,
    now: number
): void {
    if (market === undefined) {
        recordWorkerActivity(
            actor,
            {
                reason: 'unavailable',
                text: 'Городской реестр спроса сейчас недоступен.',
                intent: 'wait',
            },
            now
        )
        return
    }
    const waiting = kinds.filter((kind) => {
        const row = market.rows.find((entry) => entry.itemId === kind)
        return (
            row !== undefined &&
            row.stock < row.target &&
            now < (nextWorkAt.get(kind) ?? 0)
        )
    })
    if (waiting.length > 0) {
        recordWorkerActivity(
            actor,
            {
                reason: 'break',
                text: 'Норма добычи на этот рабочий цикл уже использована; жду следующего выхода.',
                intent: 'wait',
                until: Math.min(
                    ...waiting.map((kind) => nextWorkAt.get(kind) ?? now)
                ),
            },
            now
        )
    } else {
        recordWorkerActivity(
            actor,
            {
                reason: 'stock_sufficient',
                text: 'Городу пока достаточно ресурсов моей основной профессии.',
                intent: 'wait',
            },
            now
        )
    }
}
