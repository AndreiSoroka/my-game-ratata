import type {
    NpcQuestSnapshot,
    QuestObjective,
    QuestTurnInPromptSnapshot,
} from '@my-game-ratata/contracts'

import type { AdventureService } from './adventure'
import type { GameCharacter } from './character'
import type { ExchangeService } from './exchange'
import type { NavigationService } from './navigation'
import type { NpcQuestService } from './npcQuests'
import type { PartyService } from './parties'
import { availableInventoryQuantity } from './rewardReservations'
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
    navigationFor: (actor: GameCharacter) => NavigationService
}
export type QuestTurnInAction = 'report' | 'turn_in'

export function turnInContact(
    environment: QuestTurnInEnvironment,
    player: GameCharacter,
    issuer: GameCharacter,
    now: number
): boolean {
    return (
        player.controllerKind === 'network_player' &&
        player.connected &&
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

function hasDeliveries(
    player: GameCharacter,
    objectives: readonly QuestObjective[]
): boolean {
    const required = new Map<string, number>()
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
            player.inventory
                .filter((item) => item.itemId === itemId)
                .reduce(
                    (sum, item) =>
                        sum +
                        availableInventoryQuantity(
                            player.inventory,
                            item.instanceId
                        ),
                    0
                ) >= quantity
    )
}

function workerAction(
    environment: QuestTurnInEnvironment,
    player: GameCharacter,
    job: NpcQuestSnapshot
): QuestTurnInAction | undefined {
    const request = environment.parties
        .questHistory(job.issuerId, player.id)
        .find((entry) => entry.instanceId === job.instanceId)?.workRequest
    if (request !== undefined && !request.proofAccepted) {
        return request.stage === 'waiting' &&
            hasDeliveries(player, job.objectives)
            ? 'report'
            : undefined
    }
    return job.status === 'ready' ? 'turn_in' : undefined
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
    return job.status === 'ready' && hasDeliveries(player, job.objectives)
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
        objectives: structuredClone(job.objectives),
        objectiveLabels: structuredClone(job.objectiveLabels ?? []),
        ...(job.objectiveMessages === undefined
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
