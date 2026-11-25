import type {
    AdventureDialogue,
    AdventureShopOffer,
    AgentDecision,
    CharacterSnapshot,
    MarketSnapshot,
    QuestDraft,
    Vector2,
    WorkRequestSnapshot,
    WorldSnapshot,
} from '@my-game-ratata/contracts'

import type { AdventureService } from '../game/adventure'
import type { GameCharacter } from '../game/character'
import type { NavigationService } from '../game/navigation'
import type { WorkerRequestService } from '../game/workerRequests'

export interface NpcAiWorld {
    social?: {
        quests: Pick<
            import('../game/npcQuests').NpcQuestService,
            'cityFund'
        > & {
            publications?: Pick<
                import('../game/questBoardPublications').QuestBoardPublications,
                'list'
            >
        }
        workerActivity(
            id: string,
            now: number
        ):
            | import('@my-game-ratata/contracts').WorkerActivitySnapshot
            | undefined
    }
    getCharacter(id: string): GameCharacter | undefined
    snapshot(now: number, locationId: string, actorId: string): WorldSnapshot
    navigationFor(actor: GameCharacter): NavigationService
    adventureForWorkers(): Pick<AdventureService, 'economy'>
    workerRequests: Pick<WorkerRequestService, 'list'>
}

export interface NpcAiTarget {
    key: string
    kind:
        | 'character'
        | 'building'
        | 'landmark'
        | 'item'
        | 'chest'
        | 'world'
        | 'resource'
        | 'farm'
        | 'grave'
    id: string
    name: string
    position: Vector2
    distance: number
    interactionRange: number
    /** Candidates only; every submission is revalidated by ordinary game rules. */
    commands: AgentDecision[]
    details: Record<string, unknown>
}

export interface NpcAiObservation {
    knownPlaces?: Array<import('./guideTargets').NpcKnownPlace>
    scenarios?: NonNullable<
        ReturnType<typeof import('./npcScenarios').observeNpcScenarios>
    >
    contracts?: import('./contractProjection').KnownContracts
    itemDefinitions?: Partial<
        Record<import('@my-game-ratata/contracts').ItemId, { name: string }>
    >
    social?: import('@my-game-ratata/contracts').SocialSnapshot & {
        questInvitation?:
            import('@my-game-ratata/contracts').QuestInvitationSnapshot | null
    }
    tick: number
    serverTime: number
    locationId: string
    locationName: string
    self: Pick<
        CharacterSnapshot,
        | 'id'
        | 'nickname'
        | 'position'
        | 'alive'
        | 'health'
        | 'resources'
        | 'inventory'
        | 'equipment'
        | 'control'
        | 'abilities'
        | 'resourceChecks'
    > & { gold: number }
    targets: NpcAiTarget[]
    dialogue: AdventureDialogue | null
    dialogueCommands: AgentDecision[]
    market?: MarketSnapshot
    shop?: AdventureShopOffer[]
    city?: {
        market?: MarketSnapshot
        requests: WorkRequestSnapshot[]
        publishedOrders?: Array<
            Pick<QuestDraft, 'title' | 'objectives' | 'rewardGold'>
        >
        municipalQuestGold?: number
        residentHomes?: Array<{ id: string; name: string; position: Vector2 }>
        workers?: Array<{
            id: string
            name: string
            activity: import('@my-game-ratata/contracts').WorkerActivitySnapshot
        }>
    }
    capabilities?: {
        intentions: string[]
        constraints: string[]
        navigation: {
            mapCollision: true
            automaticEnemyAvoidance: false
            conditionalDangerTriggers: false
        }
    }
}
