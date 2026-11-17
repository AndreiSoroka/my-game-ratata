import type { NpcQuestSocialSnapshot } from '@my-game-ratata/contracts'

import { cloneQuestOffer } from './npcQuestOffers'
import type {
    NpcQuestEnvironment,
    NpcQuestRecord,
    QuestOfferRecord,
} from './npcQuestTypes'

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
    const last = [...context.jobs.values()]
        .reverse()
        .find((job) => job.acceptedBy === actorId)
    const job = active ?? last
    return {
        questOffer: cloneQuestOffer(
            offer !== undefined && offer.view.expiresAt > now
                ? offer
                : undefined
        ),
        quest: job === undefined ? null : structuredClone(job.view),
    }
}
