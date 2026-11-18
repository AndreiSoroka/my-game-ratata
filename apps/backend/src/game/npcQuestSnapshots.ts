import type { NpcQuestSocialSnapshot } from '@my-game-ratata/contracts'

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
    const active = context.jobs.get(
        context.environment.parties.contractSlots.get(group.key) ?? ''
    )
    const job =
        active !== undefined &&
        !['completed', 'cancelled'].includes(active.view.status)
            ? active
            : undefined
    return {
        questOffer: cloneQuestOffer(
            offer !== undefined &&
                questOfferAvailable(offer, context.environment, now)
                ? offer
                : undefined
        ),
        quest: job === undefined ? null : structuredClone(job.view),
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
                (job.acceptedBy === recipientId ||
                    job.submittedBy === recipientId ||
                    job.baseline.has(recipientId) ||
                    environment.parties
                        .contractRoster(job.view.instanceId)
                        .members.has(recipientId))
        )
        .map((job) => structuredClone(job.view))
}
