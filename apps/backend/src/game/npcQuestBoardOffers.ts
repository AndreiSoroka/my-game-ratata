import type {
    GuildQuestDefinition,
    QuestRewardMode,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { QuestAcceptanceContext } from './npcQuestAcceptance'
import { redeemPublishedQuest } from './npcQuestGeneratedAcceptance'
import type { NpcQuestLifecycle } from './npcQuestLifecycle'
import type { NpcQuestOfferOperations } from './npcQuestOfferOperations'
import {
    createGuildBoardOffer,
    createQuestOffer,
    createWorkerQuestOffer,
} from './npcQuestOffers'
import { completeNpcQuest } from './npcQuestTurnIn'
import {
    type NpcQuestRecord,
    type NpcQuestResult,
    questOfferAvailable,
    type QuestOfferRecord,
    questResult,
} from './npcQuestTypes'
import type {
    PublicQuestPosting,
    QuestBoardPublications,
} from './questBoardPublications'

/** Private offers for canonical board entries requested in a validated conversation. */
export class NpcQuestBoardOffers {
    public constructor(
        private readonly context: QuestAcceptanceContext,
        private readonly publications: QuestBoardPublications,
        private readonly offerOperations: NpcQuestOfferOperations,
        private readonly lifecycle: NpcQuestLifecycle,
        private readonly record: (job: NpcQuestRecord, now: number) => void
    ) {}

    public offerGuild(
        issuer: GameCharacter,
        targetId: string,
        definition: GuildQuestDefinition,
        now: number
    ): NpcQuestResult {
        return this.presentBoardOffer(
            targetId,
            createGuildBoardOffer(
                issuer,
                targetId,
                definition,
                this.context.environment,
                this.newBoardOfferId(),
                now
            ),
            now
        )
    }

    public offerWorker(
        issuer: GameCharacter,
        targetId: string,
        definition: GuildQuestDefinition,
        now: number
    ): NpcQuestResult {
        const offer = createWorkerQuestOffer(
            issuer,
            targetId,
            definition.id,
            this.context.environment,
            this.newBoardOfferId(),
            now
        )
        if (typeof offer !== 'string') {
            offer.boardOffer = true
            offer.boardGuildId = definition.id
            const {
                title,
                description,
                titleMessage,
                descriptionMessage,
                rewardGold,
            } = definition
            Object.assign(offer.view, {
                title,
                description,
                titleMessage,
                descriptionMessage,
                rewardGold,
            })
        }
        return this.presentBoardOffer(targetId, offer, now)
    }

    public offerStory(
        issuer: GameCharacter,
        targetId: string,
        questId: string,
        now: number
    ): NpcQuestResult {
        const draft =
            this.context.environment.adventure.authoredStoryDraft(questId)
        return draft === undefined
            ? questResult(false, 'Городской заказ уже недоступен.')
            : this.presentBoardOffer(
                  targetId,
                  createQuestOffer(
                      issuer,
                      targetId,
                      draft,
                      this.context.environment,
                      this.newBoardOfferId(),
                      now,
                      true
                  ),
                  now
              )
    }

    public offerPublished(
        issuer: GameCharacter,
        targetId: string,
        postId: string,
        now: number
    ): NpcQuestResult {
        return this.presentBoardOffer(
            targetId,
            this.preparePublishedOffer(
                issuer,
                targetId,
                this.publications.get(postId, now),
                this.newBoardOfferId(),
                now
            ),
            now
        )
    }

    public redeemPublished(
        actor: GameCharacter,
        issuer: GameCharacter,
        postId: string,
        revision: number,
        rewardMode: QuestRewardMode,
        now: number
    ): NpcQuestResult {
        const posting = this.publications.get(postId, now)
        if (posting?.revision !== revision) {
            return questResult(false, 'Этот заказ сейчас недоступен для сдачи.')
        }
        const offer = this.preparePublishedOffer(
            issuer,
            actor.id,
            posting,
            postId,
            now
        )
        return typeof offer === 'string'
            ? questResult(false, offer)
            : redeemPublishedQuest(
                  this.context,
                  actor,
                  issuer,
                  offer,
                  rewardMode,
                  now,
                  (job, shares) =>
                      completeNpcQuest(
                          {
                              lifecycle: this.lifecycle,
                              record: this.record,
                          },
                          actor,
                          job,
                          shares,
                          now
                      )
              )
    }

    private newBoardOfferId(): string {
        return this.context.environment.adventure.questFunding.newId(
            'board-offer'
        )
    }

    private preparePublishedOffer(
        issuer: GameCharacter,
        targetId: string,
        posting: PublicQuestPosting | undefined,
        id: string,
        now: number
    ): QuestOfferRecord | string {
        if (posting?.issuerId !== issuer.id) {
            return 'Заказ уже занят или недоступен.'
        }
        const offer = createQuestOffer(
            issuer,
            targetId,
            posting.draft,
            this.context.environment,
            id,
            now,
            true
        )
        if (typeof offer !== 'string') {
            offer.publication = posting
            offer.view.expiresAt = Math.min(
                offer.view.expiresAt,
                posting.expiresAt
            )
            offer.view.objectiveLabels = posting.objectiveLabels
            offer.view.objectiveMessages = posting.objectiveMessages
        }
        return offer
    }

    private presentBoardOffer(
        targetId: string,
        offer: QuestOfferRecord | string,
        now: number
    ): NpcQuestResult {
        if (typeof offer === 'string') {
            return questResult(false, offer)
        }
        const current = this.context.offers.get(targetId)
        if (
            current?.boardOffer === true &&
            current.view.issuerId === offer.view.issuerId &&
            current.boardGuildId === offer.boardGuildId &&
            current.publication?.id === offer.publication?.id &&
            current.view.authoredQuestId === offer.view.authoredQuestId &&
            questOfferAvailable(current, this.context.environment, now)
        ) {
            return questResult(true)
        }
        return this.offerOperations.publish(targetId, offer, now)
    }
}
