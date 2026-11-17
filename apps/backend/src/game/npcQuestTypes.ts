import type {
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
