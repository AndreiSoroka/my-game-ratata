import {
    NPC_ENGLISH_NAMES,
    npcQuestMessage,
    type NpcQuestSnapshot,
    type QuestHistoryEntry,
    type QuestRewardMode,
} from '@my-game-ratata/contracts'

import type { AdventureService } from './adventure'
import { adventureNpcRoles } from './adventureContent'
import type { GameCharacter } from './character'
import type { ExchangeService } from './exchange'
import { configureNpcQuestDialogue } from './npcQuestDialogue'
import type { NpcQuestService } from './npcQuests'
import type { PartyService } from './parties'
import { questBoardIssuerId } from './questBoardCatalog'
import { questSpeech } from './questChatWords'
import { conversationContracts } from './questConversation'
import { QuestTurnInService } from './questTurnIn'
import type { GameRoom } from './room'
import type { NpcHeardSpeech } from './roomNpcConversations'
import { canHearNearbySpeech } from './socialSpeech'
import type { WhisperService } from './whispers'

interface DialogueEnvironment {
    room: GameRoom
    adventure: AdventureService
    parties: PartyService
    quests: NpcQuestService
    exchanges: ExchangeService
    whispers: WhisperService
    actors: () => Iterable<GameCharacter>
}

export class RoomQuestDialogues {
    public readonly turnIns: QuestTurnInService
    private readonly seenCompletions = new Set<string>()
    public constructor(private readonly environment: DialogueEnvironment) {
        this.turnIns = new QuestTurnInService({
            ...environment,
            getCharacter: (id) => environment.room.getCharacter(id),
            characters: environment.actors,
            navigationFor: (actor) => environment.room.navigationFor(actor),
            localeFor: (id) => environment.room.localeFor(id),
        })
        configureNpcQuestDialogue(
            environment.adventure,
            environment.quests,
            environment.room.workerRequests,
            (id) => environment.room.getCharacter(id)
        )
    }

    public confirm(
        actor: GameCharacter,
        id: string,
        accept: boolean,
        now: number,
        rewardMode?: QuestRewardMode
    ): void {
        const result = this.turnIns.confirm(actor, id, accept, now, rewardMode)
        this.environment.room.publishEvents(result.events)
        if (!result.accepted) {
            this.environment.room.publishEvents([
                {
                    kind: 'notice',
                    actorId: actor.id,
                    audienceIds: [actor.id],
                    text: result.error ?? 'Сдача недоступна.',
                },
            ])
        }
    }

    public stop(): void {
        this.turnIns.stop()
        this.environment.parties.stop()
    }

    public conversation(issuerId: string, recipientId: string, now: number) {
        const offer = this.environment.quests.snapshot(
            recipientId,
            now
        ).questOffer
        const issuerQuests = this.contracts(issuerId, recipientId, now)
        const player = this.environment.room.getCharacter(recipientId)
        return {
            questOffer: offer?.issuerId === issuerId ? offer : null,
            issuerQuests,
            ...(issuerId !== questBoardIssuerId || player === undefined
                ? {}
                : {
                      availableOrders: this.turnIns.catalog
                          .available(player, now)
                          .map(({ entry }) => entry),
                  }),
            questHistory: this.environment.quests.journal.conversation(
                issuerId,
                recipientId
            ),
        }
    }

    public heardPublic(
        actor: GameCharacter,
        { text, at }: NpcHeardSpeech,
        targetIds: readonly string[] | undefined
    ): boolean {
        const contacts = [...this.environment.actors()].filter(
            (candidate) =>
                candidate.id !== actor.id &&
                candidate.controllerKind !== 'network_player' &&
                (targetIds === undefined || targetIds.includes(candidate.id)) &&
                canHearNearbySpeech(
                    candidate,
                    actor,
                    this.environment.room.navigationFor(actor),
                    at,
                    48
                )
        )
        if (targetIds?.length === 1) {
            return contacts.some((issuer) =>
                this.turnIns.heard(actor, issuer, text, at)
            )
        }
        const askedBy =
            questSpeech(text) === 'yes'
                ? this.turnIns.questionIssuer(actor, at)
                : undefined
        if (askedBy !== undefined) {
            return contacts.some(
                (issuer) =>
                    issuer.id === askedBy &&
                    this.turnIns.heard(actor, issuer, text, at)
            )
        }
        const relevant = contacts.filter(
            (candidate) =>
                candidate.id === questBoardIssuerId ||
                this.contracts(candidate.id, actor.id, at).some(({ status }) =>
                    ['active', 'ready', 'reward_missing'].includes(status)
                )
        )
        return (
            relevant.length === 1 &&
            relevant.some((issuer) =>
                this.turnIns.heard(actor, issuer, text, at)
            )
        )
    }

    public deliveredQuestion(
        issuer: GameCharacter,
        recipientId: string,
        text: string,
        now: number
    ): void {
        const recipient = this.environment.room.getCharacter(recipientId)
        if (recipient !== undefined) {
            this.turnIns.deliveredQuestion(issuer, recipient, text, now)
        }
    }

    public update(now: number): void {
        this.turnIns.update(now)
        for (const player of this.environment.actors()) {
            if (player.controllerKind !== 'network_player') {
                continue
            }
            for (const issuerId of this.knownIssuers(player.id)) {
                const issuer = this.environment.room.getCharacter(issuerId)
                if (issuer === undefined) {
                    continue
                }
                for (const job of this.contracts(issuer.id, player.id, now)) {
                    this.record(player, issuer, job, now)
                    this.reportCompletion(player, job)
                }
            }
        }
    }

    private contracts(
        issuerId: string,
        recipientId: string,
        now: number
    ): NpcQuestSnapshot[] {
        return conversationContracts(
            {
                ...this.environment,
                getCharacter: (id) => this.environment.room.getCharacter(id),
            },
            issuerId,
            recipientId,
            now
        )
    }

    private knownIssuers(playerId: string): Set<string> {
        const ids = new Set(this.environment.quests.journal.issuerIds(playerId))
        for (const job of this.environment.parties.questHistory('', playerId)) {
            const issuerId = job.issuerId ?? job.workRequest?.clerkId
            if (issuerId !== undefined) {
                ids.add(issuerId)
            }
        }
        for (const [id, role] of Object.entries(adventureNpcRoles)) {
            if (role.quest) {
                ids.add(id)
            }
        }
        return ids
    }

    private record(
        player: GameCharacter,
        issuer: GameCharacter,
        job: NpcQuestSnapshot,
        now: number
    ): void {
        const source: QuestHistoryEntry['source'] = job.instanceId.startsWith(
            'story:'
        )
            ? 'story'
            : this.environment.parties
                    .questHistory(issuer.id, player.id)
                    .some((entry) => entry.instanceId === job.instanceId)
              ? 'guild'
              : 'npc'
        const action = nextAction(job, issuer)
        const nextActionMessage =
            job.status === 'ready'
                ? {
                      key: 'authored.npc.quest.returnToNamedGiver',
                      params: {
                          issuer: issuer.nickname,
                          issuerEn:
                              NPC_ENGLISH_NAMES[issuer.id] ?? issuer.nickname,
                      },
                  }
                : npcQuestMessage(action)
        this.environment.quests.journal.record({
            id: job.id,
            instanceId: job.instanceId,
            source,
            issuerId: issuer.id,
            recipientId: player.id,
            title: job.title,
            ...(job.titleMessage === undefined
                ? {}
                : { titleMessage: job.titleMessage }),
            status: job.status,
            at: now,
            rewardGold: job.rewardGold,
            revision: job.revision,
            ...(job.receiptId === undefined
                ? {}
                : { receiptId: job.receiptId }),
            contactId: issuer.id,
            contactName: issuer.nickname,
            locationId: issuer.locationId,
            nextAction: action,
            ...(nextActionMessage === undefined ? {} : { nextActionMessage }),
        })
    }

    private reportCompletion(
        player: GameCharacter,
        job: NpcQuestSnapshot
    ): void {
        const receipt = job.receiptId
        if (job.status !== 'completed' || receipt === undefined) {
            return
        }
        const key = `${receipt}:${player.id}`
        if (this.seenCompletions.has(key)) {
            return
        }
        this.seenCompletions.add(key)
        const text = 'Договор сдан, награда передана.'
        const textMessage = npcQuestMessage(text)
        this.environment.room.publishEvents([
            {
                kind: 'notice',
                actorId: player.id,
                audienceIds: [player.id],
                text,
                ...(textMessage === undefined ? {} : { textMessage }),
            },
        ])
    }
}

function nextAction(job: NpcQuestSnapshot, issuer: GameCharacter): string {
    if (job.status === 'completed') {
        return 'Договор сдан, награда передана.'
    }
    if (job.status === 'ready') {
        return `Вернуться к ${issuer.nickname} и сказать «квест готов».`
    }
    return job.notice ?? 'Выполнить условия договора.'
}
