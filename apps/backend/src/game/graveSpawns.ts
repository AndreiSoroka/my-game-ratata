import {
    FINAL_DEATH_SKELETON_DELAY_MS,
    GRAVE_MAX_LIVING,
    GRAVE_SPAWN_INTERVAL_MS,
    type GraveSourceDefinition,
    type Vector2,
    type WorldObjectBounds,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { NavigationService } from './navigation'
import { createSkeleton, type SpawnedCharacter } from './spawns'

interface GraveSource {
    definition: GraveSourceDefinition
    children: Set<string>
    nextSpawnAt: number
    nextBirth: number
    retryAt: number
}

interface SpawnContext {
    characters: ReadonlyMap<string, GameCharacter>
    navigation: (locationId: string) => NavigationService
    occupants: (locationId: string) => readonly WorldObjectBounds[]
    add: (spawn: SpawnedCharacter) => void
    remove: (id: string) => void
}

/** Sources own birth cadence; their ordinary shared characters own combat and death. */
export class GraveSpawns {
    private readonly sources = new Map<string, GraveSource>()

    public snapshot(locationId: string): GraveSourceDefinition[] {
        return [...this.sources.values()]
            .map((source) => source.definition)
            .filter(
                (source) =>
                    source.locationId === locationId &&
                    source.id.startsWith('final:')
            )
            .map((source) => structuredClone(source))
    }

    public register(
        definition: GraveSourceDefinition,
        initialChildren: readonly string[],
        now: number,
        firstDelay = GRAVE_SPAWN_INTERVAL_MS
    ): void {
        if (this.sources.has(definition.id)) {
            return
        }
        this.sources.set(definition.id, {
            definition: structuredClone(definition),
            children: new Set(initialChildren),
            nextSpawnAt: now + firstDelay,
            nextBirth: 1,
            retryAt: 0,
        })
    }

    public schedule(character: GameCharacter, now: number): void {
        if (
            character.controllerKind !== 'network_player' ||
            !character.mortal ||
            !character.tags.has('state.retired') ||
            character.alive
        ) {
            return
        }
        this.register(
            {
                id: `final:${character.id}`,
                locationId: character.locationId,
                position: { ...character.position },
            },
            [],
            now,
            FINAL_DEATH_SKELETON_DELAY_MS
        )
    }

    public update(now: number, context: SpawnContext): void {
        for (const source of this.sources.values()) {
            const living = this.livingChildren(source, context, now)
            if (now < source.nextSpawnAt || now < source.retryAt) {
                continue
            }
            if (living >= GRAVE_MAX_LIVING) {
                source.nextSpawnAt = now + GRAVE_SPAWN_INTERVAL_MS
                continue
            }
            const entry = source.definition
            const navigation = context.navigation(entry.locationId)
            const position = safePosition(entry, navigation, context)
            if (position === undefined) {
                source.retryAt = now + 1_000
                continue
            }
            const spawn = createSkeleton(
                navigation,
                `_grave_${entry.id}_${String(source.nextBirth++)}`,
                navigation.worldToTile(position),
                'none'
            )
            // The factory receives the actual location grid and a checked tile.
            spawn.character.locationId = entry.locationId
            source.children.add(spawn.character.id)
            source.nextSpawnAt = now + GRAVE_SPAWN_INTERVAL_MS
            context.add(spawn)
        }
    }

    private livingChildren(
        source: GraveSource,
        context: SpawnContext,
        now: number
    ): number {
        let living = 0
        for (const id of source.children) {
            const child = context.characters.get(id)
            if (child?.alive === true) {
                living++
            } else if (
                child === undefined ||
                (child.respawnAt > 0 && now >= child.respawnAt)
            ) {
                context.remove(id)
                source.children.delete(id)
            }
        }
        return living
    }
}

function safePosition(
    entry: GraveSourceDefinition,
    navigation: NavigationService,
    context: SpawnContext
): Vector2 | undefined {
    const occupied = [
        ...context.occupants(entry.locationId),
        ...[...context.characters.values()]
            .filter((actor) => actor.locationId === entry.locationId)
            .map((actor) => ({
                x: actor.position.x - 8,
                y: actor.position.y - 8,
                width: 16,
                height: 16,
            })),
    ]
    const origin = navigation.worldToTile(entry.position)
    const candidates: Vector2[] = []
    for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
            const tile = { x: origin.x + dx, y: origin.y + dy }
            if (!navigation.isSolidTile(tile)) {
                candidates.push(navigation.tileToWorld(tile))
            }
        }
    }
    candidates.sort(
        (a, b) =>
            distanceSquared(a, entry.position) -
            distanceSquared(b, entry.position)
    )
    return candidates.find((point) =>
        occupied.every((bounds) => !overlapsSpawn(point, bounds))
    )
}

function overlapsSpawn(point: Vector2, bounds: WorldObjectBounds): boolean {
    return (
        point.x + 8 > bounds.x &&
        point.x - 8 < bounds.x + bounds.width &&
        point.y + 8 > bounds.y &&
        point.y - 8 < bounds.y + bounds.height
    )
}

function distanceSquared(a: Vector2, b: Vector2): number {
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2
}
