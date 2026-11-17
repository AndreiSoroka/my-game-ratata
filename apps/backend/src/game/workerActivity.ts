import type {
    WorkerActivitySnapshot,
    WorkRequestSnapshot,
} from '@my-game-ratata/contracts'

import type { AdventureService } from './adventure'
import type { GameCharacter } from './character'
import { isEconomyWorker, readWorkerActivity } from './workerActivityState'
import { requestActivity } from './workerRequestActivity'
import type { WorkerRequestService } from './workerRequests'

/** Projection of the controller's last real decision, never guessed from an empty path. */
export function workerActivity(
    actor: GameCharacter,
    adventure: AdventureService,
    requests: WorkerRequestService,
    now: number
): WorkerActivitySnapshot | undefined {
    if (!isEconomyWorker(actor)) {
        return undefined
    }
    if (
        !actor.alive ||
        actor.tags.has('offline') ||
        actor.tags.has('state.retired')
    ) {
        return {
            reason: 'unavailable',
            text: actor.alive
                ? 'Персонаж сейчас недоступен для обычной работы.'
                : 'Работник погиб и сейчас не может работать.',
            intent: 'wait',
            observedAt: now,
        }
    }
    const current = readWorkerActivity(actor)
    const request = requests.forWorker(actor.id)
    if (current !== undefined && currentActivityRelevant(current, request)) {
        return current
    }
    if (
        request !== null &&
        !['completed', 'cancelled'].includes(request.stage)
    ) {
        return { ...requestActivity(request), observedAt: now }
    }
    const status = actor.tags.has('worker.farmer')
        ? adventure.farmSupply.workStatus(actor, now)
        : undefined
    return {
        ...(status ?? {
            reason: 'working',
            text: 'Жду очередного решения обычной рабочей политики.',
            intent: 'work',
        }),
        observedAt: now,
    }
}

function currentActivityRelevant(
    current: WorkerActivitySnapshot,
    request: WorkRequestSnapshot | null
): boolean {
    return (
        request === null ||
        (['completed', 'cancelled'].includes(request.stage) &&
            current.requestId === undefined) ||
        (request.id === current.requestId && request.stage === current.stage) ||
        [
            'exchange',
            'conversation',
            'control',
            'reaction',
            'scenario',
        ].includes(current.reason)
    )
}
