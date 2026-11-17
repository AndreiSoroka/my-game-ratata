import type {
    WorkerActivitySnapshot,
    WorkRequestSnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { recordWorkerActivity } from './workerActivityState'
import type { WorkerIncident } from './workerRequestData'

export function requestActivity(
    view: WorkRequestSnapshot
): WorkerActivitySnapshot {
    const descriptions: Record<
        WorkRequestSnapshot['stage'],
        { text: string; intent: NonNullable<WorkerActivitySnapshot['intent']> }
    > = {
        reporting: {
            text: 'Иду к распорядителю сообщить о замеченной опасности.',
            intent: 'report',
        },
        waiting: {
            text: 'Заявка о ранее замеченной опасности ждёт исполнителя или его доклада. Нынешняя безопасность участка ещё не подтверждена.',
            intent: 'wait',
        },
        outbound: {
            text: 'Иду на рабочий участок для настоящей проверки после доклада.',
            intent: 'check_work',
        },
        working: {
            text: 'Проверяю участок обычным рабочим действием.',
            intent: 'check_work',
        },
        returning: {
            text: 'Возвращаюсь к распорядителю с результатом проверки участка.',
            intent: 'return',
        },
        ready: {
            text: 'Рабочая проверка выполнена. Жду сдачи договора и выплаты у распорядителя.',
            intent: 'wait',
        },
        completed: {
            text: 'Обращение завершено; возвращаюсь к обычной работе.',
            intent: 'work',
        },
        cancelled: { text: 'Обращение отменено.', intent: 'wait' },
    }
    const description = descriptions[view.stage]
    return {
        reason: 'request',
        text: view.reason ?? description.text,
        intent: description.intent,
        requestId: view.id,
        stage: view.stage,
    }
}

export function recordWorkerIncidentActivity(
    actor: GameCharacter,
    incident: WorkerIncident,
    now: number
): void {
    const value = requestActivity(incident.view)
    const reason = incident.activityReason ?? value.reason
    recordWorkerActivity(
        actor,
        {
            ...value,
            ...(incident.activityIntent === undefined
                ? {}
                : { intent: incident.activityIntent }),
            reason,
            worksite: structuredClone(incident.target),
            ...(incident.activityUntil === undefined
                ? {}
                : { until: incident.activityUntil }),
            ...(incident.threatObservedAt === undefined
                ? {}
                : {
                      danger: {
                          status: reason === 'threat' ? 'observed' : 'reported',
                          observedAt: incident.threatObservedAt,
                      },
                  }),
        },
        now
    )
}
