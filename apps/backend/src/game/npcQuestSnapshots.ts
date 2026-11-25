import {
    npcQuestMessage,
    type NpcQuestSocialSnapshot,
} from '@my-game-ratata/contracts'

import { cloneQuestOffer } from './npcQuestOffers'
import type {
    NpcQuestEnvironment,
    NpcQuestRecord,
    QuestOfferRecord,
} from './npcQuestTypes'
import { questOfferAvailable } from './npcQuestTypes'

export function snapshotNpcQuests(
    actorId: string,
    now: number,
    context: {
        environment: NpcQuestEnvironment
        offers: ReadonlyMap<string, QuestOfferRecord>
        jobs: ReadonlyMap<string, NpcQuestRecord>
    }
): NpcQuestSocialSnapshot {
    const offer = context.offers.get(actorId)
    const group = context.environment.parties.contractGroup(actorId)
    const quests = [
        ...context.environment.parties.contractSlots.idsFor(group.key),
    ].flatMap((id) => {
        const job = context.jobs.get(id)
        return job === undefined ? [] : [snapshotQuest(job)]
    })
    return {
        questOffer: cloneQuestOffer(
            offer !== undefined &&
                questOfferAvailable(offer, context.environment, now)
                ? offer
                : undefined
        ),
        quests,
    }
}

export function conversationNpcQuests(
    jobs: Iterable<NpcQuestRecord>,
    environment: NpcQuestEnvironment,
    issuerId: string,
    recipientId: string
) {
    return [...jobs]
        .filter(
            (job) =>
                job.view.issuerId === issuerId &&
                (environment.parties
                    .contractRoster(job.view.instanceId)
                    .members.has(recipientId) ||
                    ((job.view.status === 'completed' ||
                        job.view.status === 'cancelled') &&
                        (job.acceptedBy === recipientId ||
                            job.submittedBy === recipientId ||
                            job.baseline.has(recipientId))))
        )
        .map(snapshotQuest)
}

function snapshotQuest(job: NpcQuestRecord) {
    const view = structuredClone(job.view)
    const noticeMessage = npcQuestMessage(view.notice)
    return noticeMessage === undefined ? view : { ...view, noticeMessage }
}
