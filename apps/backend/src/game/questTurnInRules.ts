import type {
    GameLocale,
    ItemId,
    NpcQuestSnapshot,
    QuestObjective,
    QuestTurnInPromptSnapshot,
    WorkRequestSnapshot,
} from '@my-game-ratata/contracts'

import type { AdventureService } from './adventure'
import type { GameCharacter } from './character'
import type { ExchangeService } from './exchange'
import type { NavigationService } from './navigation'
import type { NpcQuestService } from './npcQuests'
import { questTransferReachable } from './npcQuestTypes'
import type { PartyService } from './parties'
import { availableItemQuantity } from './rewardReservations'
import { canHearSpeech } from './socialSpeech'
import type { WhisperService } from './whispers'

export interface QuestTurnInEnvironment {
    adventure: AdventureService
    parties: PartyService
    quests: NpcQuestService
    exchanges: ExchangeService
    whispers: WhisperService
    getCharacter: (id: string) => GameCharacter | undefined
    characters: () => Iterable<GameCharacter>
    navigationFor: (
        actor: Pick<GameCharacter, 'locationId'>
    ) => NavigationService
    localeFor: (id: string) => GameLocale
}
export type QuestTurnInAction = 'report' | 'turn_in'

export interface QuestContact {
    issuerId: string
    issuerDeath: number
    playerDeath: number
    locationId: string
    expiresAt: number
}

export function questContactAt(
    issuer: GameCharacter,
    player: GameCharacter,
    expiresAt: number
): QuestContact {
    return {
        issuerId: issuer.id,
        issuerDeath: issuer.deathSequence,
        playerDeath: player.deathSequence,
        locationId: player.locationId,
        expiresAt,
    }
}

export function currentQuestContact(
    environment: QuestTurnInEnvironment,
    player: GameCharacter,
    contact: QuestContact,
    now: number
): GameCharacter | undefined {
    const issuer = environment.getCharacter(contact.issuerId)
    return issuer !== undefined &&
        contact.expiresAt > now &&
        player.deathSequence === contact.playerDeath &&
        issuer.deathSequence === contact.issuerDeath &&
        player.locationId === contact.locationId &&
        turnInContact(environment, player, issuer, now)
        ? issuer
        : undefined
}

export function turnInContact(
    environment: QuestTurnInEnvironment,
    player: GameCharacter,
    issuer: GameCharacter,
    now: number
): boolean {
    return (
        player.controllerKind === 'network_player' &&
        player.connected &&
        issuer.controllerKind !== 'network_player' &&
        issuer.soul.controlSource !== 'human' &&
        canHearSpeech(
            player,
            issuer,
            environment.navigationFor(player),
            now,
            48
        ) &&
        canHearSpeech(
            issuer,
            player,
            environment.navigationFor(player),
            now,
            48
        )
    )
}

export function hasDeliveries(
    player: GameCharacter,
    objectives: readonly QuestObjective[]
): boolean {
    const required = new Map<ItemId, number>()
    for (const objective of objectives) {
        if (objective.kind === 'deliver') {
            required.set(
                objective.itemId,
                (required.get(objective.itemId) ?? 0) + objective.quantity
            )
        }
    }
    return [...required].every(
        ([itemId, quantity]) =>
            availableItemQuantity(player.inventory, itemId) >= quantity
    )
}

export function activeWorkerRequest(
    environment: QuestTurnInEnvironment,
    player: GameCharacter,
    job: NpcQuestSnapshot
): WorkRequestSnapshot | undefined {
    const active = environment.parties.boardActiveJob(player.id)
    return active?.instanceId === job.instanceId &&
        active.workRequest?.id === job.workerRequestId
        ? active.workRequest
        : undefined
}

function workerAction(
    environment: QuestTurnInEnvironment,
    player: GameCharacter,
    job: NpcQuestSnapshot
): QuestTurnInAction | undefined {
    const request = activeWorkerRequest(environment, player, job)
    if (
        request === undefined ||
        !canReachWorkerClerk(environment, player, request)
    ) {
        return undefined
    }
    if (request.stage === 'waiting') {
        return request.proofAccepted || hasDeliveries(player, job.objectives)
            ? 'report'
            : undefined
    }
    return request.stage === 'ready' && job.status === 'ready'
        ? 'turn_in'
        : undefined
}

export function canReachWorkerClerk(
    environment: QuestTurnInEnvironment,
    player: GameCharacter,
    request: WorkRequestSnapshot
): boolean {
    return questTransferReachable(
        player,
        environment.getCharacter(request.clerkId),
        environment
    )
}

export function readyTurnInAction(
    environment: QuestTurnInEnvironment,
    player: GameCharacter,
    job: NpcQuestSnapshot
): QuestTurnInAction | undefined {
    if (!['active', 'ready'].includes(job.status)) {
        return undefined
    }
    if (
        !job.instanceId.startsWith('story:') &&
        environment.parties.contractGroup(player.id).leaderId !== player.id
    ) {
        return undefined
    }
    if (job.workerRequestId !== undefined) {
        return workerAction(environment, player, job)
    }
    return job.status === 'ready' &&
        questTransferReachable(
            player,
            environment.getCharacter(job.issuerId),
            environment
        ) &&
        hasDeliveries(player, job.objectives)
        ? 'turn_in'
        : undefined
}

function sourceKind(
    environment: QuestTurnInEnvironment,
    job: NpcQuestSnapshot,
    playerId: string
): QuestTurnInPromptSnapshot['source'] {
    if (job.instanceId.startsWith('story:')) {
        return 'story'
    }
    return environment.parties
        .questHistory(job.issuerId, playerId)
        .some((entry) => entry.instanceId === job.instanceId)
        ? 'guild'
        : 'npc'
}

export function createTurnInPrompt(
    environment: QuestTurnInEnvironment,
    issuer: GameCharacter,
    playerId: string,
    job: NpcQuestSnapshot,
    action: QuestTurnInAction,
    now: number
): QuestTurnInPromptSnapshot {
    const active = environment.parties.boardActiveJob(playerId)
    const withoutTrophy =
        active?.instanceId === job.instanceId &&
        active.workRequest?.proofAccepted === true
    return {
        id: environment.adventure.questFunding.newId('quest-confirm'),
        instanceId: job.instanceId,
        source: sourceKind(environment, job, playerId),
        issuerId: issuer.id,
        issuerName: issuer.nickname,
        title: job.title,
        description: job.description,
        ...(job.titleMessage === undefined
            ? {}
            : { titleMessage: job.titleMessage }),
        ...(job.descriptionMessage === undefined
            ? {}
            : { descriptionMessage: job.descriptionMessage }),
        objectives: withoutTrophy ? [] : structuredClone(job.objectives),
        objectiveLabels: withoutTrophy
            ? []
            : structuredClone(job.objectiveLabels ?? []),
        ...(job.objectiveMessages === undefined || withoutTrophy
            ? {}
            : { objectiveMessages: structuredClone(job.objectiveMessages) }),
        rewardGold: job.rewardGold,
        rewardItems: structuredClone(job.rewardItems),
        rewardMode: job.rewardMode,
        expiresAt: now + 30_000,
        revision: job.revision,
        action,
    }
}
