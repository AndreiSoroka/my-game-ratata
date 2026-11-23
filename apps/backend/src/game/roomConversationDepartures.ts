import type {
    ConversationDeparture,
    SocialSnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { canObserveRoomCharacter } from './characterSight'
import { visibleBuildingPoint } from './mapBuildings'
import { distance } from './math'
import type { NavigationService } from './navigation'
import { NPC_OBSERVATION_RADIUS, visibilityRadius } from './queries'
import type { GameRoom } from './room'
import { speechAvailable } from './socialSpeech'

export type NpcConversationFeedback = Pick<
    SocialSnapshot,
    'conversationDepartures'
>

const recentLimit = 8
const visibleForMs = 30_000

interface ObservedDepartures {
    deathSequence: number
    recent: ConversationDeparture[]
    pending: ConversationDeparture[]
}

/** Contact losses are earned observations, independent of how a character is controlled. */
export class RoomConversationDepartures {
    private readonly observations = new WeakMap<
        GameCharacter,
        ObservedDepartures
    >()

    public constructor(private readonly room: GameRoom) {}

    public record(npc: GameCharacter, departure: ConversationDeparture): void {
        this.remember(npc, departure)
        const listener = this.room.getCharacter(departure.listenerId)
        if (listener?.locationId !== npc.locationId) {
            return
        }
        const navigation = this.room.navigationFor(npc)
        for (const observer of this.room.charactersFor(npc)) {
            if (
                observer !== npc &&
                speechAvailable(observer) &&
                canSee(observer, npc, navigation, departure.at) &&
                canSee(observer, listener, navigation, departure.at)
            ) {
                this.remember(observer, departure)
            }
        }
    }

    public snapshot(
        observer: GameCharacter,
        now: number
    ): NpcConversationFeedback {
        return project(
            this.current(observer)?.recent.filter(
                (departure) => now - departure.at < visibleForMs
            )
        )
    }

    public take(observer: GameCharacter): NpcConversationFeedback {
        return project(this.current(observer)?.pending.splice(0))
    }

    private remember(
        observer: GameCharacter,
        departure: ConversationDeparture
    ): void {
        const memory = this.current(observer) ?? {
            deathSequence: observer.deathSequence,
            recent: [],
            pending: [],
        }
        memory.recent = [...memory.recent, departure].slice(-recentLimit)
        memory.pending = [...memory.pending, departure].slice(-recentLimit)
        this.observations.set(observer, memory)
    }

    private current(observer: GameCharacter): ObservedDepartures | undefined {
        const memory = this.observations.get(observer)
        return memory?.deathSequence === observer.deathSequence
            ? memory
            : undefined
    }
}

function canSee(
    observer: GameCharacter,
    target: GameCharacter,
    navigation: NavigationService,
    now: number
): boolean {
    return (
        target.alive &&
        !target.tags.has('offline') &&
        !target.tags.has('state.retired') &&
        canObserveRoomCharacter(observer, target, navigation, now) &&
        distance(observer.position, target.position) <=
            visibilityRadius(observer, target, NPC_OBSERVATION_RADIUS, now) &&
        visibleBuildingPoint(
            navigation.grid.buildings ?? [],
            observer.position,
            target.position
        ) &&
        navigation.hasLineOfSight(observer.position, target.position)
    )
}

function project(
    departures: ConversationDeparture[] | undefined
): NpcConversationFeedback {
    return departures === undefined || departures.length === 0
        ? {}
        : {
              conversationDepartures: departures.map((departure) => ({
                  ...departure,
              })),
          }
}
