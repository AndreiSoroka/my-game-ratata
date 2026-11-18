import type {
    GameEventPayload,
    NpcQuestSnapshot,
    QuestDraft,
    QuestOfferSnapshot,
} from '@my-game-ratata/contracts'

import type { AdventureService } from './adventure'
import type { GameCharacter } from './character'
import type { NavigationService } from './navigation'
import type { PartyService } from './parties'
import { canHearSpeech } from './socialSpeech'
import type { WorkerRequestService } from './workerRequests'

export interface NpcQuestEnvironment {
    characters: () => Iterable<GameCharacter>
    adventure: AdventureService
    parties: PartyService
    workers: WorkerRequestService
    getCharacter: (id: string) => GameCharacter | undefined
    navigationFor: (
        actor: Pick<GameCharacter, 'locationId'>
    ) => NavigationService
    canIssue?: (actor: GameCharacter) => boolean
}

/** Server-owned execution context; never parsed from a model decision. */
export interface NpcQuestDecisionContext {
    freshDialogueTargetId?: string
    freshDialogueMessageId?: string
    freshDialogueAt?: number
    autonomous?: boolean
    introduction?: string
}

export interface QuestOfferRecord {
    view: QuestOfferSnapshot
    draft: QuestDraft | null
    targetId: string
    issuerDeath: number
}

export interface NpcQuestRecord {
    view: NpcQuestSnapshot
    draft: QuestDraft
    acceptedAt: number
    acceptedBy: string
    submittedBy?: string
    issuerDeath: number
    baseline: Map<string, string>
    receipts: Set<string>
    closeDeathListener?: () => void
}

export function terminalReceiptOwner(
    job: NpcQuestRecord,
    actorId: string
): boolean {
    return (
        ['completed', 'cancelled'].includes(job.view.status) &&
        (job.acceptedBy === actorId || job.submittedBy === actorId)
    )
}

export function questActorAvailable(
    actor: GameCharacter | undefined
): actor is GameCharacter {
    return (
        actor !== undefined &&
        actor.alive &&
        !actor.tags.has('offline') &&
        !actor.tags.has('state.retired') &&
        (actor.controllerKind !== 'network_player' || actor.connected)
    )
}

export function questContact(
    actor: GameCharacter,
    issuer: GameCharacter | undefined,
    environment: NpcQuestEnvironment,
    now = Date.now()
): issuer is GameCharacter {
    return (
        questActorAvailable(actor) &&
        questActorAvailable(issuer) &&
        canHearSpeech(actor, issuer, environment.navigationFor(actor), now) &&
        canHearSpeech(issuer, actor, environment.navigationFor(actor), now)
    )
}

export function movementFingerprint(actor: GameCharacter): string {
    return `${actor.locationId}:${String(actor.position.x)}:${String(actor.position.y)}`
}

export function questOfferAvailable(
    offer: QuestOfferRecord,
    environment: NpcQuestEnvironment,
    now: number
): boolean {
    const issuer = environment.getCharacter(offer.view.issuerId)
    const recipient = environment.getCharacter(offer.targetId)
    return (
        issuer !== undefined &&
        recipient !== undefined &&
        offer.view.expiresAt > now &&
        issuer.deathSequence === offer.issuerDeath &&
        questContact(recipient, issuer, environment, now)
    )
}

export interface NpcQuestResult {
    accepted: boolean
    error: string | null
    events: GameEventPayload[]
}
