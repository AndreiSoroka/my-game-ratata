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
import type { PublicQuestPosting } from './questBoardPublications'
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
    cityReviewIntervalMs?: number
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
    boardOffer?: true
    boardGuildId?: string
    publication?: PublicQuestPosting
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

export function questTransferReachable(
    actor: GameCharacter,
    issuer: GameCharacter | undefined,
    environment: Pick<NpcQuestEnvironment, 'navigationFor'>
): boolean {
    return (
        questActorAvailable(actor) &&
        questActorAvailable(issuer) &&
        actor.locationId === issuer.locationId &&
        environment
            .navigationFor(actor)
            .hasLineOfSight(actor.position, issuer.position)
    )
}

export function movementFingerprint(actor: GameCharacter): string {
    return `${actor.locationId}:${String(actor.position.x)}:${String(actor.position.y)}`
}

export function publicationAvailable(
    posting: PublicQuestPosting,
    environment: NpcQuestEnvironment,
    now: number
): boolean {
    const issuer = environment.getCharacter(posting.issuerId)
    return (
        posting.status === 'open' &&
        posting.expiresAt > now &&
        questActorAvailable(issuer) &&
        issuer.deathSequence === posting.issuerDeath &&
        issuer.locationId === posting.cityId &&
        environment.adventure.questFunding.reservations.valid(posting.id)
    )
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
        boardOfferStillAvailable(offer, recipient, environment) &&
        (offer.publication === undefined ||
            publicationAvailable(offer.publication, environment, now)) &&
        (offer.view.authoredQuestId === undefined ||
            environment.adventure.storyOfferError(
                issuer,
                offer.targetId,
                offer.view.authoredQuestId
            ) === undefined) &&
        offer.view.expiresAt > now &&
        issuer.deathSequence === offer.issuerDeath &&
        questContact(recipient, issuer, environment, now)
    )
}

function boardOfferStillAvailable(
    offer: QuestOfferRecord,
    recipient: GameCharacter,
    environment: NpcQuestEnvironment
): boolean {
    if (offer.boardOffer !== true || offer.view.authoredQuestId !== undefined) {
        return true
    }
    const group = environment.parties.contractGroup(recipient.id)
    return (
        !group.occupied &&
        group.leaderId === recipient.id &&
        (offer.boardGuildId === undefined ||
            environment.parties
                .boardDefinitions(recipient.id)
                .some((definition) => definition.id === offer.boardGuildId))
    )
}

export interface NpcQuestResult {
    accepted: boolean
    error: string | null
    events: GameEventPayload[]
}

export function questResult(
    accepted: boolean,
    error: string | null = null
): NpcQuestResult {
    return { accepted, error, events: [] }
}
