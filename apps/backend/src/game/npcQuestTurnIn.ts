import type { QuestRewardShare } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { NpcQuestLifecycle } from './npcQuestLifecycle'
import { questRewardWallet } from './npcQuestOfferOperations'
import type { NpcQuestResult } from './npcQuests'
import { settleNpcQuest } from './npcQuestSettlement'
import {
    type NpcQuestEnvironment,
    type NpcQuestRecord,
    questContact,
} from './npcQuestTypes'

export function turnInNpcQuest(
    context: {
        environment: NpcQuestEnvironment
        lifecycle: NpcQuestLifecycle
        record: (job: NpcQuestRecord, now: number) => void
    },
    actor: GameCharacter,
    job: NpcQuestRecord,
    now: number
): NpcQuestResult {
    if (job.view.status === 'completed') {
        return result(true)
    }
    context.lifecycle.refresh(job)
    const issuer = context.environment.getCharacter(job.view.issuerId)
    if (
        job.view.status !== 'ready' ||
        !questContact(actor, issuer, context.environment, now)
    ) {
        return result(
            false,
            job.view.notice ?? 'Условия ещё не выполнены или заказчик далеко.'
        )
    }
    const wallet = questRewardWallet(
        context.environment,
        { view: job.view },
        issuer
    )
    const shares =
        wallet === undefined
            ? undefined
            : settleNpcQuest(
                  job,
                  actor,
                  issuer,
                  wallet,
                  context.environment,
                  now
              )
    if (shares === undefined) {
        return result(
            false,
            'Передача не состоялась: проверьте вещи, вместимость и награду.'
        )
    }
    completeNpcQuest(context, actor, job, shares, now)
    return result(true)
}

export function completeNpcQuest(
    context: {
        lifecycle: NpcQuestLifecycle
        record: (job: NpcQuestRecord, now: number) => void
    },
    actor: GameCharacter,
    job: NpcQuestRecord,
    shares: QuestRewardShare[],
    now: number
): void {
    job.view.status = 'completed'
    job.submittedBy = actor.id
    job.view.rewardShares = shares
    job.view.receiptId = job.view.instanceId
    job.view.notice = 'Договор выполнен. Имущество и награда переданы.'
    context.lifecycle.release(job)
    context.record(job, now)
}
function result(
    accepted: boolean,
    error: string | null = null
): NpcQuestResult {
    return { accepted, error, events: [] }
}
