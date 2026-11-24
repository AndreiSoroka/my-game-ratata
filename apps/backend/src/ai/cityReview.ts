import type { GameCharacter } from '../game/character'
import type { GameRoom } from '../game/room'
import { buildNpcAiObservation } from './observation'
import { enqueueNpcAiEvent, type NpcAiActorState } from './runtimeState'

export function reviewNpcAiCity(
    state: NpcAiActorState,
    actor: GameCharacter,
    now: number,
    room: GameRoom,
    intervalMs: number,
    nextId: (kind: string) => string
): void {
    state.inspectAt = now + 1_000
    if (
        state.config.mode === 'dialogue_only' ||
        !room.allowsAutonomousNpcAi() ||
        cityReviewBusy(state)
    ) {
        return
    }
    const city = buildNpcAiObservation(room, actor, state.config.role, now).city
    const fingerprint = cityReviewFingerprint(city)
    const changed =
        state.cityFingerprint !== undefined &&
        state.cityFingerprint !== fingerprint
    state.cityFingerprint = fingerprint
    if ((!changed && now < state.reviewAt) || state.task !== null) {
        return
    }
    state.reviewAt = now + intervalMs
    state.memory = state.conversations.get('city') ?? ''
    state.task = {
        id: nextId('city'),
        cityReviewIntervalMs: intervalMs,
        requesterId: null,
        request:
            'Разовый городской обзор: оцени реальные нужды и выбери следующий шаг. Для новой реальной задачи можешь опубликовать заказ на городской доске через quest_board_publish: учти уже открытые заказы и свободное городское золото. Можно навестить доступного жителя: используй видимого собеседника или общеизвестный адрес из city.residentHomes, подойди и проверь, кто сейчас на месте. Можно устно пригласить живого игрока обсудить существующее обращение или проверяемое задание: задай короткий вопрос и дождись его ответа, не открывай окно самостоятельно. Не создавай ресурсы или награды и не осматривай работника повторно без изменений. Закончи обзор, если больше нечего сделать.',
        steps: 0,
    }
    enqueueNpcAiEvent(state, {
        kind: 'world',
        id: nextId('world'),
        reason: changed ? 'city_changed' : 'city_review',
        at: now,
    })
}

export function npcAiCityFingerprint(city: unknown): string {
    return JSON.stringify({ city }, (key, value: unknown) =>
        key === 'observedAt' || key === 'since' ? undefined : value
    )
}

function cityReviewFingerprint(
    city: ReturnType<typeof buildNpcAiObservation>['city']
): string {
    const { publishedOrders, municipalQuestGold, ...activity } = city ?? {}
    // The coordinator's own open reservations should not trigger another review.
    const openReserve = (publishedOrders ?? []).reduce(
        (gold, order) => gold + order.rewardGold,
        0
    )
    return npcAiCityFingerprint({
        ...activity,
        municipalQuestGold:
            municipalQuestGold === undefined
                ? undefined
                : municipalQuestGold + openReserve,
    })
}

function cityReviewBusy(state: NpcAiActorState): boolean {
    return (
        state.awaitingFreshRequest ||
        state.inbox.length > 0 ||
        state.dialogue !== undefined ||
        state.controller !== undefined ||
        state.ready !== undefined ||
        state.finalizing !== undefined
    )
}
