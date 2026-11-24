import {
    ABILITY_DEFINITIONS,
    MOVEMENT_RULES,
    WILDERNESS_AGGRO_POLICY,
} from '@my-game-ratata/contracts'
import { afterEach, expect, it, vi } from 'vitest'

import { GameCharacter } from '../src/game/character'
import {
    lastHeardCombatNoise,
    recordProjectileNoise,
} from '../src/game/hearing'
import { NavigationService } from '../src/game/navigation'
import { GameRoom } from '../src/game/room'
import { roomTickMs } from '../src/game/roomLoop'
import { pursuitFixture } from './pursuitTestHelpers'
import { joinScenarioRoom } from './scenarioRoomHelpers'

let room: GameRoom | undefined
// These tests advance the full world simulation under fake time.
const worldSimulationTimeoutMs = 20_000

afterEach(() => {
    room?.stop()
    room = undefined
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

function firingRange(heroClass: 'ranger' | 'arcanist') {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const width = 80
    const navigation = new NavigationService({
        id: 'projectile-hearing',
        width,
        height: 80,
        tileWidth: 16,
        tileHeight: 16,
        solid: new Array<boolean>(width * 80).fill(false),
        solidLayerNames: [],
    })
    const game = new GameRoom(navigation)
    room = game
    const player = joinScenarioRoom(game, 'Projectile tester', heroClass)
    const skeleton = game.getCharacter('mob_skeleton_1_map-2-1')
    if (skeleton === undefined) {
        throw new Error('Skeleton fixture is missing')
    }
    const origin = { ...skeleton.position, x: skeleton.position.x + 80 }
    const forest = game.navigationFor(skeleton)
    const wall = forest.worldToTile({ ...origin, x: origin.x - 32 })
    for (let y = wall.y - 1; y <= wall.y + 1; y += 1) {
        forest.grid.solid[y * width + wall.x] = true
    }
    player.actor.locationId = skeleton.locationId
    player.actor.position = { ...origin }
    game.start()
    const heard = () => lastHeardCombatNoise(skeleton, game, game.gameplayNow())
    const visible = () =>
        game.findVisibleTarget(
            skeleton,
            WILDERNESS_AGGRO_POLICY.sightRadius,
            game.gameplayNow()
        )
    return { game, player, skeleton, forest, origin, heard, visible }
}

it.each(['shot', 'spark', 'fireball'] as const)(
    'investigates an unseen %s release at the original firing position',
    (abilityId) => {
        const { game, player, skeleton, forest, origin, heard, visible } =
            firingRange(abilityId === 'shot' ? 'ranger' : 'arcanist')
        // Start between ticks to check the release deadline and the actual hearing time.
        vi.advanceTimersByTime(17)
        player.actor.abilities.known.add(abilityId)
        player.send({ type: 'use_ability', abilityId })
        const hitAt =
            game.gameplayNow() + ABILITY_DEFINITIONS[abilityId].windupMs
        vi.advanceTimersByTime(ABILITY_DEFINITIONS[abilityId].windupMs - 1)
        expect(visible()).toBeUndefined()
        expect(heard()).toBeUndefined()
        vi.advanceTimersByTime(roomTickMs)
        const release = heard()
        if (release === undefined) {
            throw new Error('Missing projectile release noise')
        }
        expect(release.position).toEqual(origin)
        expect(release.emittedAt).toBeGreaterThanOrEqual(hitAt)
        expect(release.emittedAt).toBeLessThan(hitAt + roomTickMs)

        // The route uses the point heard at launch, even if the source has moved.
        player.actor.position = { ...origin, x: origin.x + 160 }
        vi.advanceTimersByTime(50)
        expect(visible()).toBeUndefined()
        expect(heard()).toEqual(release)
        expect(
            forest.worldToTile(skeleton.path.at(-1) ?? skeleton.position)
        ).toEqual(forest.worldToTile(origin))
        vi.advanceTimersByTime(200)
        expect(heard()).toEqual(release)
        player.actor.locationId = player.actor.spawnLocationId
        vi.advanceTimersByTime(50)
        expect(heard()).toEqual(release)
        expect(
            lastHeardCombatNoise(
                skeleton,
                game,
                release.emittedAt + MOVEMENT_RULES.investigationMs
            )
        ).toBeUndefined()
    },
    worldSimulationTimeoutMs
)

it('keeps a hostile release in skeleton memory when an ally fires', () => {
    const { actor, target, room, characters, now } = pursuitFixture()
    const ally = new GameCharacter({
        id: 'allied-archer',
        nickname: 'Ally',
        archetype: 'human',
        controllerKind: 'scripted',
        heroClass: 'ranger',
        faction: actor.faction,
        locationId: actor.locationId,
        spawnPosition: { x: actor.position.x - 16, y: actor.position.y },
    })
    characters.push(ally)
    recordProjectileNoise(room, target, target.position, now())
    expect(lastHeardCombatNoise(ally, room, now())).toBeUndefined()
    const received = { position: target.position, emittedAt: now() }
    expect(lastHeardCombatNoise(actor, room, now())).toEqual(received)

    recordProjectileNoise(room, ally, ally.position, now() + 1)
    expect(lastHeardCombatNoise(actor, room, now() + 1)).toEqual(received)
})

it('forgets combat noise when a skeleton respawns before the sound expires', () => {
    const { actor, target, room, now } = pursuitFixture()
    recordProjectileNoise(room, target, target.position, now())
    expect(lastHeardCombatNoise(actor, room, now())).toBeDefined()

    actor.applyDamage(actor.maxHp, now() + 1)
    actor.queueRespawn(now() + 1, 500)
    actor.tickTimedState(now() + 501)
    expect(actor.alive).toBe(true)
    expect(lastHeardCombatNoise(actor, room, now() + 501)).toBeUndefined()
})

it.each(['shot', 'spark', 'fireball'] as const)(
    'emits no %s noise from an interrupted windup',
    (abilityId) => {
        const { game, player, heard } = firingRange(
            abilityId === 'shot' ? 'ranger' : 'arcanist'
        )
        player.actor.abilities.known.add(abilityId)
        player.send({ type: 'use_ability', abilityId })
        expect(player.actor.combat.action?.abilityId).toBe(abilityId)
        const actionId = player.actor.combat.action?.id
        expect(actionId).toBeDefined()
        player.actor.stunUntil = game.gameplayNow() + 3_000
        vi.advanceTimersByTime(
            ABILITY_DEFINITIONS[abilityId].windupMs + roomTickMs
        )
        expect(heard()).toBeUndefined()
        if (abilityId === 'spark') {
            expect(
                player.sent.filter(
                    (message) =>
                        message.type === 'event' &&
                        message.event.kind === 'attack' &&
                        message.event.phase === 'interrupted' &&
                        message.event.actionId === actionId
                )
            ).toHaveLength(1)
        }
    },
    worldSimulationTimeoutMs
)
