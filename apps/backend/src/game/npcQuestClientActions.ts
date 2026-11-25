import type { NpcQuestClientMessage } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { NpcQuestLifecycle } from './npcQuestLifecycle'
import { turnInNpcQuest } from './npcQuestTurnIn'
import {
    type NpcQuestEnvironment,
    type NpcQuestRecord,
    type NpcQuestResult,
    terminalReceiptOwner,
} from './npcQuestTypes'

interface ClientQuestContext {
    environment: NpcQuestEnvironment
    jobs: ReadonlyMap<string, NpcQuestRecord>
    lifecycle: NpcQuestLifecycle
    record: (entry: NpcQuestRecord, now: number) => void
    answer: (
        actor: GameCharacter,
        message: Extract<NpcQuestClientMessage, { type: 'quest_offer_answer' }>,
        now: number
    ) => NpcQuestResult
    inquire: (
        actor: GameCharacter,
        id: string,
        index: number,
        now: number
    ) => NpcQuestResult
}

/** Ordinary validated player commands remain the sole acceptance and payout boundary. */
export function handleNpcQuestClient(
    context: ClientQuestContext,
    actor: GameCharacter,
    message: NpcQuestClientMessage,
    now: number
): NpcQuestResult {
    if (message.type === 'quest_offer_answer') {
        return context.answer(actor, message, now)
    }
    if (message.type === 'quest_inquire') {
        return context.inquire(
            actor,
            message.instanceId,
            message.objectiveIndex,
            now
        )
    }
    if (message.type === 'quest_turn_in_confirm') {
        return result(
            false,
            'Подтверждение доступно только через серверное окно сдачи.'
        )
    }
    const job = context.jobs.get(message.instanceId)
    const group = context.environment.parties.contractGroup(actor.id)
    if (group.leaderId !== actor.id) {
        return result(false, 'Договор принимает и сдаёт лидер группы.')
    }
    if (
        job === undefined ||
        (!context.environment.parties.contractSlots.owns(
            group.key,
            message.instanceId
        ) &&
            !terminalReceiptOwner(job, actor.id))
    ) {
        return result(false, 'Этот договор вам недоступен.')
    }
    if (message.type === 'npc_quest_abandon') {
        context.lifecycle.cancel(job, 'Договор оставлен. Награда освобождена.')
        context.record(job, now)
        return result(true)
    }
    return turnInNpcQuest(context, actor, job, now)
}

function result(
    accepted: boolean,
    error: string | null = null
): NpcQuestResult {
    return { accepted, error, events: [] }
}
