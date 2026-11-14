import {
    FINAL_DEATH_SKELETON_DELAY_MS,
    GRAVE_MAX_HP,
    GRAVE_MAX_LIVING,
    GRAVE_RESTORE_MS,
    GRAVE_SPAWN_INTERVAL_MS,
    type GraveSourceDefinition,
    type Vector2,
    type WorldObjectBounds,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { GraveGuardians } from './graveGuardians'
import type { GraveCombatTarget, GraveDamageResult } from './graveRules'
import type { NavigationService } from './navigation'
import { createSkeleton, type SpawnedCharacter } from './spawns'

interface GraveSource {
    definition: GraveSourceDefinition
    children: Set<string>
    nextSpawnAt: number
    nextBirth: number
    retryAt: number
    phase: GraveCombatTarget['phase']
    hpUnits: number
    restoresAt: number | null
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
    private readonly guardians = new GraveGuardians()

    public snapshot(locationId: string): GraveCombatTarget[] {
        return [...this.sources.values()]
            .filter((source) => source.definition.locationId === locationId)
            .map(snapshotSource)
    }

    public get(id: string): GraveCombatTarget | undefined {
        const source = this.sources.get(id)
        return source === undefined ? undefined : snapshotSource(source)
    }

    public damage(id: string, amount: number, now: number): GraveDamageResult {
        const source = this.sources.get(id)
        if (
            source?.phase !== 'active' ||
            !Number.isFinite(amount) ||
            !Number.isFinite(now) ||
            amount <= 0
        ) {
            return { accepted: false, hpDamage: 0, ruined: false }
        }
        const units = Math.min(
            source.hpUnits,
            Math.round(Math.min(GRAVE_MAX_HP, amount) * 100)
        )
        if (units <= 0) {
            return { accepted: false, hpDamage: 0, ruined: false }
        }
        source.hpUnits -= units
        if (source.hpUnits === 0) {
            source.phase = 'ruined'
            source.restoresAt = now + GRAVE_RESTORE_MS
        }
        return {
            accepted: true,
            hpDamage: units / 100,
            ruined: source.phase === 'ruined',
        }
    }

    public purify(id: string, now: number): boolean {
        const source = this.sources.get(id)
        if (
            source === undefined ||
            source.phase === 'purified' ||
            !Number.isFinite(now)
        ) {
            return false
        }
        source.phase = 'purified'
        source.hpUnits = 0
        source.restoresAt = null
        this.guardians.release(id)
        // Keep the receipt and descendants: existing actors keep their ordinary life cycle.
        return true
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
            hpUnits: GRAVE_MAX_HP * 100,
            phase: 'active',
            restoresAt: null,
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
            restoreSource(source, now)
            if (source.phase !== 'purified') {
                this.guardians.sync(
                    source.definition,
                    source.children,
                    context.characters
                )
            }
            if (source.phase !== 'active') {
                continue
            }
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
            this.guardians.sync(
                source.definition,
                source.children,
                context.characters
            )
        }
    }

    public assignGuardians(
        characters: ReadonlyMap<string, GameCharacter>
    ): void {
        for (const source of this.sources.values()) {
            if (source.phase !== 'purified') {
                this.guardians.sync(
                    source.definition,
                    source.children,
                    characters
                )
            }
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

function restoreSource(source: GraveSource, now: number): void {
    if (
        source.phase !== 'ruined' ||
        source.restoresAt === null ||
        now < source.restoresAt
    ) {
        return
    }
    source.phase = 'active'
    source.hpUnits = GRAVE_MAX_HP * 100
    source.nextSpawnAt = source.restoresAt + GRAVE_SPAWN_INTERVAL_MS
    source.restoresAt = null
    source.retryAt = 0
}

function snapshotSource(source: GraveSource): GraveCombatTarget {
    return {
        ...structuredClone(source.definition),
        phase: source.phase,
        hp: source.hpUnits / 100,
        maxHp: GRAVE_MAX_HP,
        material: 'stone',
        ...(source.restoresAt === null
            ? {}
            : { restoresAt: source.restoresAt }),
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
