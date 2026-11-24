import { worldLocationNeighbor } from '@my-game-ratata/contracts'
import { afterEach, expect, it, vi } from 'vitest'

import { resolveCharacterDamage } from '../src/game/abilityDamage'
import {
    ashAssaultTarget,
    ashBoundSkeletons,
    ashSkeletonBond,
} from '../src/game/ashSkeletonState'
import { distance } from '../src/game/math'
import {
    aidWoundedSkeleton,
    defendNecromancer,
    updateNecromancerEscort,
} from '../src/game/necromancerDefense'
import { observeNecromancerScene } from '../src/game/necromancerTactics'
import {
    hasGroupHostility,
    hasPersonalHostility,
} from '../src/game/personalHostility'
import { advancePrayerCast } from '../src/game/prayer'
import { GameRoom } from '../src/game/room'
import {
    advanceSavvaTerritory,
    attemptSavvaPersuasion,
    SAVVA_ID,
    savvaHumanTrust,
    savvaPersuasionContext,
    savvaTerritorialTarget,
} from '../src/game/savvaTerritory'
import { WorldMaps } from '../src/game/worldMaps'
import { joinScenarioRoom } from './scenarioRoomHelpers'

let room: GameRoom | undefined
afterEach(() => {
    room?.stop()
    vi.restoreAllMocks()
})

function fixture() {
    const game = new GameRoom(undefined, {
        worldMaps: new WorldMaps({ seed: 'savva-ai-fixture' }),
    })
    room = game
    const savva = game.getCharacter(SAVVA_ID)
    if (savva === undefined) {
        throw new Error('Missing Savva')
    }
    const locationId = savva.locationId
    const navigation = game.navigationFor(savva)
    const origin = navigation.worldToTile(savva.position)
    const home = { ...savva.position }
    const offsets = Array.from({ length: 19 }, (_, index) => index - 9)
    const points = offsets.flatMap((x) =>
        offsets.flatMap((y) => {
            const tile = { x: origin.x + x, y: origin.y + y }
            return navigation.isSolidTile(tile)
                ? []
                : [navigation.tileToWorld(tile)]
        })
    )
    function spot(min: number, max: number) {
        const point = points.find((point) => {
            const cells = distance(home, point) / navigation.grid.tileWidth
            return (
                cells >= min &&
                cells <= max &&
                navigation.hasLineOfSight(home, point)
            )
        })
        if (point === undefined) {
            throw new Error('Refuge fixture needs visible tiles in each band')
        }
        return point
    }
    const inner = spot(1, 1)
    const band = spot(3, 4)
    const outside = spot(6, 7)
    const beyondLeash = spot(9, 10)
    const visitor = joinScenarioRoom(game, 'Странник')
    visitor.actor.locationId = locationId
    visitor.actor.position = outside
    const warnings = () =>
        visitor.sent.filter(
            (message) =>
                message.type === 'event' &&
                message.event.actorId === savva.id &&
                message.event.kind === 'chat' &&
                message.event.text?.includes('Не подходи ближе') === true
        )
    function enter(at: number) {
        visitor.actor.position = outside
        advanceSavvaTerritory(game, at)
        visitor.actor.position = band
        advanceSavvaTerritory(game, at + 100)
        visitor.actor.position = inner
        advanceSavvaTerritory(game, at + 200)
    }
    function arrive(name: string) {
        const session = joinScenarioRoom(game, name)
        session.actor.locationId = locationId
        session.actor.position = inner
        return session
    }
    return {
        game,
        savva,
        navigation,
        inner,
        band,
        outside,
        beyondLeash,
        visitor: visitor.actor,
        warnings,
        enter,
        arrive,
    }
}

it('turns Savva and his three skeletons against unrelated humans on the first warned trespass', () => {
    const {
        game,
        savva,
        visitor,
        enter,
        warnings,
        arrive,
        inner,
        beyondLeash,
    } = fixture()
    const time = Date.now()
    const group = ashBoundSkeletons(savva)
    expect(group).toHaveLength(3)
    expect(
        group.filter(
            (skeleton) => ashSkeletonBond(skeleton)?.guard !== undefined
        )
    ).toHaveLength(1)
    expect(
        group.every((skeleton) => !hasGroupHostility(skeleton, visitor))
    ).toBe(true)
    const newcomer = arrive('Клирик Дымный')
    newcomer.actor.position = beyondLeash
    enter(time)
    expect(savvaHumanTrust(savva, visitor)).toBe(-20)
    expect(hasPersonalHostility(savva, visitor, time + 201)).toBe(true)
    expect(hasGroupHostility(savva, newcomer.actor)).toBe(true)
    expect(
        group.every((skeleton) => hasGroupHostility(skeleton, newcomer.actor))
    ).toBe(true)
    advanceSavvaTerritory(game, time + 3_900)
    expect(savvaHumanTrust(savva, visitor)).toBe(-20)
    enter(time + 4_000)
    expect(savvaHumanTrust(savva, visitor)).toBe(-40)
    expect(hasGroupHostility(savva, visitor)).toBe(true)
    enter(time + 5_000)
    expect(warnings()).toHaveLength(3)
    expect(hasGroupHostility(savva, visitor)).toBe(true)
    expect(savvaHumanTrust(savva, visitor)).toBe(-60)
    expect(savva.faction).toBe('peaceful')

    visitor.position = beyondLeash
    const undead = arrive('Сторож Райм')
    undead.actor.lich = true
    const now = time + 6_000
    newcomer.actor.position = {
        x: (inner.x + savva.position.x) / 2,
        y: (inner.y + savva.position.y) / 2,
    }
    advanceSavvaTerritory(game, now)
    expect(savvaTerritorialTarget(savva)).toBe(newcomer.actor)
    expect(hasGroupHostility(savva, undead.actor)).toBe(false)
    const scene = observeNecromancerScene(savva, game, now)
    expect(scene.threat).toBe(newcomer.actor)
    updateNecromancerEscort(savva, scene, now)
    expect(
        group.filter(
            (skeleton) => ashAssaultTarget(skeleton) === newcomer.actor
        )
    ).toHaveLength(2)
    defendNecromancer(savva, game, scene, newcomer.actor, [], now)
    expect(savva.pendingAttack?.targetId).toBe(newcomer.actor.id)
    newcomer.actor.position = beyondLeash
    advanceSavvaTerritory(game, now + 50)
    expect(savvaTerritorialTarget(savva)).toBeUndefined()
    expect(savva.pendingAttack).toBeUndefined()
})

it('heals a critically wounded escort through the ordinary Ash prayer', () => {
    const { game, savva, inner } = fixture()
    const skeleton = ashBoundSkeletons(savva).find(
        (actor) => ashSkeletonBond(actor)?.guard === undefined
    )
    if (skeleton === undefined) {
        throw new Error('Missing escort')
    }
    const now = game.gameplayNow()
    skeleton.position = inner
    skeleton.applyDamage(Math.ceil(skeleton.maxHp * 0.65), now)
    const woundedHp = skeleton.hp
    expect(
        aidWoundedSkeleton(
            savva,
            game,
            observeNecromancerScene(savva, game, now),
            now
        )
    ).toBe(true)
    const cast = savva.abilities.casting
    expect(cast).toMatchObject({
        abilityId: 'pray_grave',
        targetId: skeleton.id,
    })
    if (cast === null) {
        throw new Error('Expected Ash healing windup')
    }
    advancePrayerCast(
        savva,
        cast.completesAt,
        game.abilityContextFor(savva, cast.completesAt),
        () => 0
    )
    expect(skeleton.hp).toBeGreaterThan(woundedHp)
})

it('starts the same hostility on a resolved hit against the chest guard even while Savva is away', () => {
    const { game, savva, visitor, arrive } = fixture()
    const guard = ashBoundSkeletons(savva).find(
        (skeleton) => ashSkeletonBond(skeleton)?.guard !== undefined
    )
    if (guard === undefined) {
        throw new Error('Missing chest guard')
    }
    const bystander = arrive('Поздний Странник').actor
    const east = worldLocationNeighbor(savva.locationId, 'east')
    if (east === undefined) {
        throw new Error('The Western Ruins must have an eastern neighbor')
    }
    savva.locationId = east.id
    expect(hasGroupHostility(guard, bystander)).toBe(false)
    const now = Date.now()
    expect(
        resolveCharacterDamage({
            actor: visitor,
            target: guard,
            amount: 1,
            damageKind: 'physical',
            respawnDelayMs: 0,
            now,
        }).hpDamage
    ).toBe(1)
    expect(hasGroupHostility(guard, bystander)).toBe(true)
    expect(hasGroupHostility(savva, bystander)).toBe(false)
    const snapshot = game.snapshot(now, guard.locationId, bystander.id)
    expect(
        snapshot.characters.find(({ id }) => id === guard.id)?.relationship
    ).toBe('hostile')
})

it('requires an audible warning, does not credit retreat, and counts a continuous stay inside only once', () => {
    const { game, savva, navigation, visitor, warnings, inner, band, outside } =
        fixture()
    const time = Date.now()
    const sight = vi.spyOn(navigation, 'hasLineOfSight').mockReturnValue(false)
    visitor.position = inner
    advanceSavvaTerritory(game, time)
    advanceSavvaTerritory(game, time + 3_000)
    expect(warnings()).toHaveLength(0)
    expect(savvaHumanTrust(savva, visitor)).toBe(0)
    sight.mockRestore()

    visitor.position = band
    advanceSavvaTerritory(game, time + 3_100)
    visitor.position = outside
    advanceSavvaTerritory(game, time + 3_200)
    expect(savvaHumanTrust(savva, visitor)).toBe(0)

    visitor.position = inner
    advanceSavvaTerritory(game, time + 4_000)
    advanceSavvaTerritory(game, time + 6_999)
    expect(savvaHumanTrust(savva, visitor)).toBe(0)
    advanceSavvaTerritory(game, time + 7_000)
    advanceSavvaTerritory(game, time + 10_000)
    expect(savvaHumanTrust(savva, visitor)).toBe(-20)
    expect(warnings()).toHaveLength(2)
})

it('accepts at most one dice result per addressed message and clears only group hostility on success', () => {
    const { game, savva, visitor, enter, arrive } = fixture()
    const time = Date.now()
    enter(time)
    enter(time + 1_000)
    enter(time + 2_000)
    const first = arrive('Рудный').actor
    const second = arrive('Голос Мира').actor
    const now = time + 3_000
    advanceSavvaTerritory(game, now)
    const context = savvaPersuasionContext(savva, first, game, now)
    if (context === undefined) {
        throw new Error('Expected Savva to accept persuasion')
    }
    const { episode } = context
    const failure = vi.fn(() => 0.65)
    const success = vi.fn(() => 0.7)
    expect(
        attemptSavvaPersuasion(
            savva,
            first,
            game,
            now,
            episode,
            'line1',
            failure
        )
    ).toEqual({ roll: 14, success: false })
    expect(
        attemptSavvaPersuasion(
            savva,
            first,
            game,
            now,
            episode,
            'line1',
            failure
        )
    ).toEqual({ roll: 14, success: false })
    expect(failure).toHaveBeenCalledTimes(1)
    expect(
        attemptSavvaPersuasion(
            savva,
            second,
            game,
            now + 14_999,
            episode,
            'line2',
            success
        )
    ).toBeUndefined()
    expect(
        savvaPersuasionContext(savva, first, game, now + 15_000)
    ).toBeUndefined()
    expect(
        attemptSavvaPersuasion(
            savva,
            second,
            game,
            now + 15_000,
            episode,
            'line2',
            success
        )
    ).toEqual({ roll: 15, success: true })
    expect(success).toHaveBeenCalledTimes(1)
    expect(hasGroupHostility(savva, first)).toBe(false)
    expect(savvaHumanTrust(savva, first)).toBe(0)
    expect(hasPersonalHostility(savva, visitor, now + 15_000)).toBe(true)
    expect(savvaTerritorialTarget(savva)).toBe(visitor)
})
