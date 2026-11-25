import type { AttackAbilityId, Vector2 } from '@my-game-ratata/contracts'
import { expect, it, vi } from 'vitest'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import {
    attemptAbilityAttack,
    attemptAttack,
    resolvePendingAttackHit,
} from '../src/game/combat'
import type { DungeonSecretDefinition } from '../src/game/dungeonSecretData'
import { DungeonSecrets } from '../src/game/dungeonSecrets'
import { createItemInstance } from '../src/game/inventory'
import { GameRoom } from '../src/game/room'
import { WorldInventory } from '../src/game/worldInventory'
import { WorldLocations } from '../src/game/worldLocations'
import { WorldMaps } from '../src/game/worldMaps'
import { abilityHero, resolveTestSpells } from './abilityTestHelpers'
import { bladeDuel } from './bladeCombatFixture'
import { joinChestRoom } from './chestTestHelpers'

const reward: NonNullable<DungeonSecretDefinition['reward']> = {
    chest: {
        x: 104,
        y: 152,
        items: [
            { itemId: 'food', quantity: 1 },
            { itemId: 'torch', quantity: 1 },
            { itemId: 'scrap', quantity: 1 },
        ],
    },
    guards: [
        { x: 88, y: 152 },
        { x: 120, y: 152 },
    ],
}

function secretWall(id: string, row: number): DungeonSecretDefinition {
    return {
        id,
        position: { x: 104, y: row * 16 + 8 },
        cells: [
            {
                index: row * 32 + 6,
                floorGid: 1,
                wallGid: 0,
                solid: false,
                surfaceGid: 1,
            },
        ],
    }
}

function wallFixture(
    hero: Parameters<typeof bladeDuel>[0] = 'vanguard',
    walls: DungeonSecretDefinition[] = [{ ...secretWall('outer', 7), reward }]
) {
    const { actor, target, at, navigation } = bladeDuel(hero)
    const inventory = new WorldInventory(navigation)
    for (const wall of walls) {
        for (const { index } of wall.cells) {
            navigation.grid.solid[index] = true
        }
    }
    actor.position = { x: 104, y: 108 }
    actor.facing = 'down'
    target.position = { x: 104, y: 135 }
    const secrets = new DungeonSecrets(walls, navigation, inventory)
    const spawn = vi.fn()
    secrets.spawnGuards = spawn
    const context = (now: number) => ({
        ...at(now),
        targetId: undefined,
        secrets,
    })
    return { actor, target, navigation, inventory, secrets, spawn, context }
}

type AttackTest = readonly [
    string,
    Parameters<typeof bladeDuel>[0],
    AttackAbilityId | undefined,
    Vector2,
]
it.each<AttackTest>([
    ['обычный удар', 'vanguard', undefined, { x: 104, y: 108 }],
    ['широкий взмах', 'vanguard', 'wide_swing', { x: 104, y: 108 }],
    ['круговой взмах', 'vanguard', 'circular_swing', { x: 104, y: 106 }],
    ['стрела', 'ranger', 'shot', { x: 104, y: 72 }],
    ['искра', 'arcanist', 'spark', { x: 104, y: 72 }],
])('открывает кладку при попадании: %s', (_name, hero, abilityId, position) => {
    const f = wallFixture(hero)
    f.actor.position = position
    if (abilityId !== undefined) {
        f.actor.abilities.known.add(abilityId)
    }
    const attack = f.context(1000)
    const events =
        abilityId === undefined
            ? attemptAttack(attack)
            : attemptAbilityAttack(attack, abilityId)
    expect(events[0]?.kind).toBe('attack')
    const resolved = resolvePendingAttackHit(f.context(3000))
    expect(resolved.some((event) => event.kind === 'notice')).toBe(true)
    expect(resolved.some((event) => event.kind === 'damage')).toBe(false)
    expect(
        f.navigation.hasLineOfSight(f.actor.position, f.target.position)
    ).toBe(true)
    expect(f.secrets.snapshot.map(({ id }) => id)).toEqual(['outer'])
    expect(f.spawn).toHaveBeenCalledTimes(1)
})

it('изнашивает оружие один раз без награды за удар по кладке', () => {
    const f = wallFixture()
    const sword = createItemInstance('simple_sword')
    f.actor.equipment.weapon = sword
    const before = f.actor.progression.masteries.blade.experience
    expect(attemptAttack(f.context(1000))).toHaveLength(1)
    resolvePendingAttackHit(f.context(2000))
    expect(sword.durability).toBe(199)
    expect(f.actor.progression.masteries.blade.experience).toBe(before)
    expect(resolvePendingAttackHit(f.context(2100))).toEqual([])
    expect(sword.durability).toBe(199)
})

it('игнорирует нулевой урон и стены за первой преградой', () => {
    const f = wallFixture()
    expect(attemptAttack(f.context(1000))).toHaveLength(1)
    const pending = f.actor.pendingAttack
    if (pending === undefined) {
        throw new Error('Missing pending attack')
    }
    pending.damageMultiplier = 0
    expect(resolvePendingAttackHit(f.context(2000))).toMatchObject([
        { kind: 'miss' },
    ])
    expect(f.secrets.snapshot).toEqual([])

    for (const abilityId of ['shot', 'spark'] as const) {
        const projectile = wallFixture(
            abilityId === 'shot' ? 'ranger' : 'arcanist'
        )
        projectile.actor.position = { x: 104, y: 72 }
        projectile.navigation.grid.solid[5 * 32 + 6] = true
        expect(
            attemptAbilityAttack(projectile.context(1000), abilityId)
        ).toHaveLength(1)
        expect(resolvePendingAttackHit(projectile.context(3000))).toMatchObject(
            [{ phase: 'completed' }, { kind: 'miss' }]
        )
        expect(projectile.secrets.snapshot).toEqual([])
    }
})

it.each([false, true])(
    'огненный шар учитывает первую преграду перед тайником (%s)',
    (blocked) => {
        const f = wallFixture('arcanist')
        const actor = abilityHero('arcanist')
        actor.position = { x: 104, y: 20 }
        actor.facing = 'down'
        actor.abilities.known.add('fireball')
        if (blocked) {
            for (let x = 0; x < 32; x += 1) {
                f.navigation.grid.solid[4 * 32 + x] = true
            }
        }
        const context = {
            characters: [actor, f.target],
            navigation: f.navigation,
            secrets: f.secrets,
            now: 1000,
            random: () => 0.5,
        }
        expect(
            handleAbilityCommand(
                actor,
                { type: 'use_ability', abilityId: 'fireball' },
                context
            )
        ).toHaveLength(1)
        const events = resolveTestSpells(actor, context, 2500)
        expect(f.secrets.snapshot.map(({ id }) => id)).toEqual(
            blocked ? [] : ['outer']
        )
        expect(events.some((event) => event.targetId === f.target.id)).toBe(
            false
        )
    }
)

it('раскрывает вложенные комнаты по порядку и только один раз выдаёт общую добычу', () => {
    const outer = secretWall('outer', 7)
    const inner = { ...secretWall('inner', 8), reward }
    const f = wallFixture('vanguard', [outer, inner])
    const before = f.secrets.snapshot
    expect(f.secrets.damage('inner', 1)).toBe(false)
    expect(f.inventory.snapshotChests()).not.toContainEqual(
        expect.objectContaining({ id: 'inner:chest' })
    )
    expect(f.secrets.damage('outer', 1)).toBe(true)
    expect(f.secrets.damage('outer', 1)).toBe(false)
    expect(f.spawn).not.toHaveBeenCalled()
    expect(before).toEqual([])
    expect(f.secrets.snapshot).toEqual([{ id: outer.id, cells: outer.cells }])

    f.navigation.setResourceObstacles([])
    expect(f.navigation.isSolidTile({ x: 6, y: 7 })).toBe(false)
    expect(f.navigation.isSolidTile({ x: 6, y: 8 })).toBe(true)
    const anotherPlayer = bladeDuel().actor
    anotherPlayer.position = { x: 104, y: 124 }
    anotherPlayer.facing = 'down'
    f.actor.position = { ...anotherPlayer.position }
    const attack = f.context(1000)
    expect(attemptAttack(attack)).toHaveLength(1)
    expect(attemptAttack({ ...attack, actor: anotherPlayer })).toHaveLength(1)
    resolvePendingAttackHit(f.context(2000))
    resolvePendingAttackHit({ ...f.context(2000), actor: anotherPlayer })
    expect(f.secrets.snapshot.map(({ id }) => id)).toEqual(['outer', 'inner'])
    expect(f.spawn).toHaveBeenCalledTimes(1)
    expect(
        f.inventory.snapshotChests().filter(({ id }) => id === 'inner:chest')
    ).toMatchObject([
        {
            id: 'inner:chest',
            itemCount: 3,
            position: { x: reward.chest.x, y: reward.chest.y },
        },
    ])
})

it('оставляет координаты закрытых тайников, сундуков и охраны вне публичных карт', () => {
    const maps = new WorldMaps({ seed: 'dungeon-832' })
    const floor = maps.dungeons.find(({ id }) => id === 'dungeon-small')
    expect(floor).toBeDefined()
    const id = floor?.id ?? ''
    const secrets = maps.secretDefinitions(id)
    expect(secrets).toHaveLength(2)
    const body = maps.asset(maps.epoch, id)?.body
    expect(body).toBeDefined()
    expect(body).not.toContain('Dungeon secrets')
    expect(body).not.toContain('generationSeed')
    expect(maps.asset(maps.epoch, 'map-2-2')?.body).not.toContain(
        'generationSeed'
    )
    for (const { id: secretId, position } of secrets ?? []) {
        expect(body).not.toContain(secretId)
        const navigation = maps.navigation(id)
        expect(navigation.isSolidTile(navigation.worldToTile(position))).toBe(
            true
        )
    }
})

it('хранит открытые проходы в мире, создавшем их из общей карты', () => {
    const maps = new WorldMaps({ seed: 'dungeon-832' })
    const center = maps.navigation('map-2-2')
    const first = new WorldLocations(center, undefined, maps).get(
        'dungeon-small'
    )
    const second = new WorldLocations(center, undefined, maps).get(
        'dungeon-small'
    )
    const secret = first.secrets?.closedWall
    if (secret === undefined) {
        throw new Error('Missing hidden wall')
    }
    const tile = first.navigation.worldToTile(secret.position)
    first.secrets?.damage(secret.id, 1)
    expect(first.navigation.isSolidTile(tile)).toBe(false)
    expect(second.navigation.isSolidTile(tile)).toBe(true)
    expect(second.secrets?.snapshot).toEqual([])
})

it('слышен только у ближайшей нераскрытой стены через свободный подход', () => {
    const outer = secretWall('outer', 7)
    const inner = { ...secretWall('inner', 8), reward }
    const { navigation, secrets } = wallFixture('vanguard', [outer, inner])

    expect(secrets.draftAt({ x: 115, y: 104 }, true)).toBe(true)
    expect(secrets.draftAt({ x: 104, y: 84 }, true)).toBe(false)
    expect(secrets.draftAt(outer.position, true)).toBe(false)
    expect(secrets.draftAt({ x: 104, y: 103 }, false)).toBe(false)
    expect(secrets.draftAt({ x: 104, y: 104 }, false)).toBe(true)
    expect(secrets.draftAt({ x: 111, y: 104 }, false)).toBe(true)
    expect(secrets.draftAt({ x: 112, y: 120 }, false)).toBe(true)
    navigation.grid.solid[6 * 32 + 6] = true
    expect(secrets.draftAt({ x: 104, y: 94 }, true)).toBe(false)

    secrets.damage(outer.id, 1)
    expect(secrets.draftAt({ x: 104, y: 120 }, false)).toBe(true)
    secrets.damage(inner.id, 1)
    expect(secrets.draftAt({ x: 104, y: 120 }, false)).toBe(false)
})

it('передаёт сквозняк идущему рядом или стоящему вплотную игроку', () => {
    vi.stubGlobal('Bun', { env: {} })
    const maps = new WorldMaps({ seed: 'dungeon-832' })
    const room = new GameRoom(maps.navigation('map-2-2'), { worldMaps: maps })
    try {
        const floor = 'dungeon-small'
        const wall = maps.secretDefinitions(floor)?.[0]?.position
        if (wall === undefined) {
            throw new Error('Missing hidden wall')
        }
        const { actor } = joinChestRoom(room, 'Draft walker')
        const { actor: other } = joinChestRoom(room, 'Draft observer')
        for (const player of [actor, other]) {
            player.locationId = floor
            player.position = { x: wall.x, y: wall.y + 22 }
        }
        const now = room.gameplayNow()
        actor.velocity = { x: 1, y: 0 }
        const snapshot = room.snapshot(now, floor, actor.id)
        expect(snapshot.dungeonDraft).toBe(true)
        expect(room.snapshot(now, floor, other.id).dungeonDraft).toBeUndefined()
        expect(room.snapshot(now, floor).dungeonDraft).toBeUndefined()
        expect(
            room.snapshot(now, 'map-2-2', actor.id).dungeonDraft
        ).toBeUndefined()
        actor.movement.dashUntil = now + 10
        expect(room.snapshot(now, floor, actor.id).dungeonDraft).toBeUndefined()
        actor.movement.dashUntil = 0
        actor.velocity = { x: 0, y: 0 }
        expect(room.snapshot(now, floor, actor.id).dungeonDraft).toBeUndefined()
        actor.position = { x: wall.x, y: wall.y + 16 }
        expect(room.snapshot(now, floor, actor.id).dungeonDraft).toBe(true)
        actor.connected = false
        expect(room.snapshot(now, floor, actor.id).dungeonDraft).toBeUndefined()
    } finally {
        room.stop()
        vi.unstubAllGlobals()
    }
})
