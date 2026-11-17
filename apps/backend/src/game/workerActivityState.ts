import type { WorkerActivitySnapshot } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'

const activities = new WeakMap<GameCharacter, WorkerActivitySnapshot>()
const sequences = new WeakMap<GameCharacter, number>()

export function isEconomyWorker(actor: GameCharacter): boolean {
    return [...actor.tags].some(
        (tag) => tag.startsWith('worker.') && !tag.startsWith('worker.city.')
    )
}

export function recordWorkerActivity(
    actor: GameCharacter,
    value: WorkerActivitySnapshot,
    now: number
): void {
    if (!isEconomyWorker(actor)) {
        return
    }
    const previous = activities.get(actor)
    const unchanged =
        previous?.reason === value.reason &&
        previous.text === value.text &&
        previous.intent === value.intent &&
        previous.stage === value.stage &&
        JSON.stringify(previous.worksite) === JSON.stringify(value.worksite)
    activities.set(actor, {
        ...structuredClone(value),
        since: unchanged ? (previous.since ?? now) : now,
        observedAt: now,
        ...(previous?.lastResult === undefined
            ? {}
            : { lastResult: previous.lastResult }),
    })
}

export function readWorkerActivity(
    actor: GameCharacter
): WorkerActivitySnapshot | undefined {
    const value = activities.get(actor)
    return value === undefined ? undefined : structuredClone(value)
}

export function recordWorkerResult(
    actor: GameCharacter,
    command: string,
    result: { accepted: boolean; error: string | null },
    now: number
): void {
    if (!isEconomyWorker(actor)) {
        return
    }
    const sequence = (sequences.get(actor) ?? 0) + 1
    sequences.set(actor, sequence)
    const current = activities.get(actor) ?? {
        reason: 'working' as const,
        text: 'Выполняю рабочее действие.',
        since: now,
        observedAt: now,
    }
    activities.set(actor, {
        ...current,
        lastResult: {
            receiptId: `worker:${actor.id}:${String(sequence)}`,
            at: now,
            accepted: result.accepted,
            command,
            reason: result.error,
        },
    })
}

export function pauseWorkerActivity(
    actor: GameCharacter,
    reason: 'exchange' | 'conversation' | 'control' | 'reaction' | 'scenario',
    now: number
): void {
    const labels = {
        exchange: 'Работа приостановлена на время добровольного обмена.',
        conversation: 'Отвечаю собеседнику; работа временно приостановлена.',
        control:
            'Рабочую политику временно заменяет другой действующий контроллер.',
        reaction: 'Реагирую на происшествие; обычная работа приостановлена.',
        scenario:
            'Выполняю принятое поручение вместо обычной рабочей политики.',
    }
    const previous = readWorkerActivity(actor)
    recordWorkerActivity(
        actor,
        { ...previous, reason, text: labels[reason], intent: 'wait' },
        now
    )
}
