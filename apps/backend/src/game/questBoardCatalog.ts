import {
    CENTER_LOCATION_ID,
    DEFAULT_QUEST_REWARD_MODE,
    type QuestBoardEntry,
    type QuestRewardMode,
    type QuestTurnInPromptSnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { novogorodStory as cityStory } from './cityStoryDefinitions'
import type { NpcQuestResult } from './npcQuests'
import { questResult, questTransferReachable } from './npcQuestTypes'
import { validateQuestDraft } from './npcQuestValidation'
import {
    bellQuest,
    type BoardQuest,
    guildQuest,
    questBoardIssuerId,
} from './questBoardEntries'
export { type BoardQuest, questBoardIssuerId } from './questBoardEntries'
import { validateQuestExcursion } from './questExcursions'
import { hasDeliveries, type QuestTurnInEnvironment } from './questTurnInRules'
import { availableGold } from './rewardReservations'

export class QuestBoardCatalog {
    public constructor(private readonly environment: QuestTurnInEnvironment) {}

    public available(player: GameCharacter, now: number): BoardQuest[] {
        const issuer = this.environment.getCharacter(questBoardIssuerId)
        if (player.locationId !== CENTER_LOCATION_ID || issuer === undefined) {
            return []
        }

        const { adventure, parties, quests } = this.environment
        const activeJob = parties.boardActiveJob(player.id)
        const entries = parties
            .boardDefinitions(player.id)
            .filter(
                (job) =>
                    job.id !== activeJob?.id &&
                    (job.workRequest === undefined ||
                        job.workRequest.clerkId === issuer.id)
            )
            .map(guildQuest)
        if (
            adventure.storyOfferError(issuer, player.id, cityStory.questId) ===
            undefined
        ) {
            entries.push(bellQuest())
        }
        for (const post of quests.publications.list(now)) {
            if (
                post.issuerId === issuer.id &&
                post.cityId === player.locationId
            ) {
                entries.push({
                    entry: {
                        id: post.id,
                        revision: post.revision,
                        source: 'published',
                        title: post.draft.title,
                        description: post.draft.description,
                        rewardGold: post.draft.rewardGold,
                        status: 'available',
                        objectiveLabels: post.objectiveLabels,
                        objectiveMessages: post.objectiveMessages,
                        expiresAt: post.expiresAt,
                    },
                    objectives: post.draft.objectives,
                })
            }
        }
        return entries
    }

    public entries(player: GameCharacter, now: number): QuestBoardEntry[] {
        const entries = this.available(player, now).map(({ entry }) => entry)
        const { adventure, parties } = this.environment
        const active = parties.boardActiveJob(player.id)
        if (active?.status === 'active' || active?.status === 'ready') {
            entries.push({ ...guildQuest(active).entry, status: active.status })
        }
        for (const job of this.environment.quests.conversation(
            questBoardIssuerId,
            player.id
        )) {
            if (
                job.instanceId.startsWith('board-order-') &&
                (job.status === 'active' || job.status === 'ready')
            ) {
                const { revision, title, description, rewardGold, status } = job
                entries.push({
                    id: job.instanceId,
                    revision,
                    title,
                    description,
                    rewardGold,
                    status,
                    source: 'published',
                })
            }
        }
        const story = adventure.snapshot(
            player.id,
            player.locationId,
            player,
            now
        ).quest
        if (story.status === 'active' || story.status === 'ready') {
            entries.push({ ...bellQuest().entry, status: story.status })
        }
        return entries
    }

    public offerable(player: GameCharacter, now: number): BoardQuest[] {
        const issuer = this.environment.getCharacter(questBoardIssuerId)
        if (issuer?.alive !== true) {
            return []
        }
        return this.available(player, now).filter((job) =>
            this.canOffer(issuer, player, job, now)
        )
    }

    private canOffer(
        issuer: GameCharacter,
        player: GameCharacter,
        job: BoardQuest,
        now: number
    ): boolean {
        if (!this.groupCanTake(player, job)) {
            return false
        }
        const request = job.guild?.workRequest
        if (request !== undefined) {
            const wallet = this.environment.adventure.questFunding.wallet(
                request.cityId
            )
            return (
                wallet !== undefined &&
                availableGold(wallet) >= job.entry.rewardGold
            )
        }
        if (job.entry.source !== 'published') {
            return true
        }
        const post = this.environment.quests.publications.get(job.entry.id, now)
        return (
            post?.revision === job.entry.revision &&
            validateQuestDraft(issuer, post.draft, this.environment) === null &&
            validateQuestExcursion(player, post.draft, this.environment) ===
                null
        )
    }

    public offer(
        issuer: GameCharacter,
        player: GameCharacter,
        job: BoardQuest,
        now: number
    ): NpcQuestResult {
        const current = this.available(player, now).find(
            ({ entry }) =>
                entry.id === job.entry.id &&
                entry.revision === job.entry.revision
        )
        if (
            issuer.id !== questBoardIssuerId ||
            current === undefined ||
            !this.canOffer(issuer, player, current, now)
        ) {
            const group = this.environment.parties.contractGroup(player.id)
            return questResult(
                false,
                group.occupied && job.entry.source !== 'story'
                    ? 'Сначала завершите действующий договор.'
                    : 'Этот договор сейчас недоступен.'
            )
        }
        job = current
        const quests = this.environment.quests.boardOffers
        switch (job.entry.source) {
            case 'story':
                return quests.offerStory(issuer, player.id, job.entry.id, now)
            case 'published':
                return quests.offerPublished(
                    issuer,
                    player.id,
                    job.entry.id,
                    now
                )
            case 'guild':
            case 'worker':
                if (job.guild === undefined) {
                    return questResult(false, 'Этот договор сейчас недоступен.')
                }
                return job.entry.source === 'worker'
                    ? quests.offerWorker(issuer, player.id, job.guild, now)
                    : quests.offerGuild(issuer, player.id, job.guild, now)
        }
    }

    public groupCanTake(player: GameCharacter, job: BoardQuest): boolean {
        if (job.entry.source === 'story') {
            return true
        }
        const group = this.environment.parties.contractGroup(player.id)
        return !group.occupied && group.leaderId === player.id
    }

    public directReady(player: GameCharacter, job: BoardQuest): boolean {
        const request = job.guild?.workRequest
        return (
            this.groupCanTake(player, job) &&
            questTransferReachable(
                player,
                this.environment.getCharacter(questBoardIssuerId),
                this.environment
            ) &&
            (request?.proofAccepted === true ||
                (job.objectives.length > 0 &&
                    job.objectives.every(
                        (objective) => objective.kind === 'deliver'
                    ) &&
                    hasDeliveries(player, job.objectives)))
        )
    }

    public directPrompt(
        issuer: GameCharacter,
        job: BoardQuest,
        now: number
    ): QuestTurnInPromptSnapshot {
        const { entry, objectives } = job
        const { titleMessage, descriptionMessage } = entry
        return {
            id: this.environment.adventure.questFunding.newId('quest-confirm'),
            instanceId: entry.id,
            revision: entry.revision,
            issuerId: issuer.id,
            issuerName: issuer.nickname,
            source:
                entry.source === 'published'
                    ? 'npc'
                    : entry.source === 'worker'
                      ? 'guild'
                      : entry.source,
            title: entry.title,
            description: entry.description,
            ...(titleMessage === undefined ? {} : { titleMessage }),
            ...(descriptionMessage === undefined ? {} : { descriptionMessage }),
            objectives: structuredClone(objectives),
            objectiveLabels: entry.objectiveLabels ?? [],
            ...(entry.objectiveMessages === undefined
                ? {}
                : { objectiveMessages: entry.objectiveMessages }),
            rewardGold: entry.rewardGold,
            rewardItems: [],
            rewardMode: DEFAULT_QUEST_REWARD_MODE,
            action: entry.source === 'worker' ? 'report' : 'turn_in',
            expiresAt: Math.min(now + 30_000, entry.expiresAt ?? Infinity),
            preAcceptance: true,
        }
    }

    public redeem(
        issuer: GameCharacter,
        player: GameCharacter,
        job: BoardQuest,
        rewardMode: QuestRewardMode,
        now: number
    ): NpcQuestResult {
        const { entry } = job
        switch (entry.source) {
            case 'story': {
                const accepted = this.environment.adventure.redeemStoryOffer(
                    issuer,
                    player,
                    entry.id,
                    rewardMode
                )
                return {
                    accepted,
                    error: accepted ? null : 'Сдача пока недоступна.',
                    events: [],
                }
            }
            case 'worker':
                return this.environment.parties.acceptBoardGuild(
                    player,
                    entry.id,
                    issuer,
                    rewardMode,
                    now,
                    true
                )
            case 'published':
                return this.environment.quests.boardOffers.redeemPublished(
                    player,
                    issuer,
                    entry.id,
                    entry.revision,
                    rewardMode,
                    now
                )
            case 'guild':
                return questResult(false, 'Сначала возьми этот договор.')
        }
    }
}
