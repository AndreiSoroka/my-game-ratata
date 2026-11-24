import {
    ABILITY_DEFINITIONS,
    CENTER_LOCATION_ID,
    type StopCorrectionRequest,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { NavigationService } from '../src/game/navigation'
import { GameRoom } from '../src/game/room'
import { snapshotStream } from '../src/game/snapshotStreamState'
import { joinScenarioRoom } from './scenarioRoomHelpers'
import { required } from './snapshotStreamFixture'

type Player = ReturnType<typeof joinScenarioRoom>

let room: GameRoom
beforeEach(() => {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    room = new GameRoom(
        new NavigationService({
            id: CENTER_LOCATION_ID,
            width: 96,
            height: 80,
            tileWidth: 16,
            tileHeight: 16,
            solid: Array<boolean>(96 * 80).fill(false),
            solidLayerNames: [],
        })
    )
    room.start()
    vi.spyOn(Math, 'random').mockReturnValue(0.8)
})
afterEach(() => {
    room.stop()
    vi.restoreAllMocks()
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

function startWalking(player: Player): void {
    player.actor.config.moveSpeed = 100
    player.send({ type: 'move_input', axis: { x: 1, y: 0 } })
}

function requestReturn(player: Player): StopCorrectionRequest {
    const { streamId, seq } = snapshotStream(player.socket)
    const request = {
        id: 1,
        streamId,
        seq,
        position: {
            x: player.actor.position.x - 1,
            y: player.actor.position.y,
        },
    }
    stop(player, request)
    return request
}

function stop(player: Player, stopCorrection: StopCorrectionRequest): void {
    player.send({ type: 'move_input', axis: { x: 0, y: 0 }, stopCorrection })
}

function snapshot(player: Player) {
    return required(snapshotStream(player.socket).baseline)
}

function damageEvents(attacker: Player, target: Player) {
    return attacker.sent.filter(
        (message) =>
            message.type === 'event' &&
            message.event.kind === 'damage' &&
            message.event.actorId === attacker.actor.id &&
            message.event.targetId === target.actor.id
    )
}

it(
    'rejects a return during melee windup and resolves the paid hit once',
    { timeout: 30_000 },
    () => {
        const walker = joinScenarioRoom(room, 'Walker')
        const attacker = joinScenarioRoom(room, 'Blade', 'vanguard')
        walker.actor.position = { x: 100, y: 100 }
        attacker.actor.position = { x: 106, y: 92 }
        attacker.actor.config.resources.energyRegenIdle = 0
        attacker.send({
            type: 'set_personal_hostility',
            targetId: walker.actor.id,
            hostile: true,
        })
        startWalking(walker)
        vi.advanceTimersByTime(50)
        const before = { ...walker.actor.position }
        vi.advanceTimersByTime(10)
        const energy = attacker.actor.energy
        attacker.send({ type: 'attack', targetId: walker.actor.id })
        const paidEnergy = attacker.actor.energy
        expect(paidEnergy).toBeLessThan(energy)
        const request = requestReturn(walker)
        vi.advanceTimersByTime(40)
        expect(attacker.actor.pendingAttack).toBeDefined()
        expect(snapshot(walker).stopCorrection).toEqual({
            id: 1,
            status: 'rejected',
        })
        expect(walker.actor.position).toEqual({ ...before, x: before.x + 1 })
        expect(snapshot(attacker).stopCorrection).toBeUndefined()
        expect(damageEvents(attacker, walker)).toHaveLength(0)

        vi.advanceTimersByTime(50)
        expect(damageEvents(attacker, walker)).toHaveLength(1)
        expect(walker.actor.hp).toBeLessThan(walker.actor.maxHp)
        const practice = attacker.actor.progression.masteries.blade.experience
        stop(walker, request)
        vi.advanceTimersByTime(200)
        expect(snapshot(walker).stopCorrection).toEqual({
            id: 1,
            status: 'rejected',
        })
        expect(damageEvents(attacker, walker)).toHaveLength(1)
        expect(attacker.actor.energy).toBe(paidEnergy)
        expect(attacker.actor.progression.masteries.blade.experience).toBe(
            practice
        )
    }
)

it.each([true, false])(
    'blocks a return only in the projectile location (same location: %s)',
    (sameLocation) => {
        const walker = joinScenarioRoom(room, 'Walker')
        const caster = joinScenarioRoom(room, 'Caster', 'arcanist')
        const target = joinScenarioRoom(room, 'Target')
        caster.actor.position = { x: 400, y: 400 }
        Object.assign(target.actor, { faction: 'monsters' })
        target.actor.position = { x: 525, y: 400 }
        caster.actor.abilities.known.add('fireball')
        caster.actor.config.resources.manaRegenIdle = 0
        if (!sameLocation) {
            walker.actor.locationId = required(
                WORLD_LOCATION_DEFINITIONS.find(
                    ({ id }) => id !== CENTER_LOCATION_ID
                )
            ).id
        }
        const navigation = room.navigationFor(walker.actor)
        walker.actor.position = navigation.tileToWorld(
            required(navigation.findWalkableTileNear({ x: 6, y: 6 }))
        )
        const mana = caster.actor.mana
        caster.send({
            type: 'cast_spell',
            skillId: 'fireball',
            targetId: target.actor.id,
        })
        const paidMana = mana - ABILITY_DEFINITIONS.fireball.mana
        expect(caster.actor.mana).toBe(paidMana)
        vi.advanceTimersByTime(450)
        expect(snapshot(caster).magicEffects).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ phase: 'flight' }),
            ])
        )
        startWalking(walker)
        vi.advanceTimersByTime(50)
        const before = { ...walker.actor.position }
        const request = requestReturn(walker)
        vi.advanceTimersByTime(50)
        expect(snapshot(walker).stopCorrection).toEqual({
            id: 1,
            status: sameLocation ? 'rejected' : 'accepted',
        })
        expect(walker.actor.position).toEqual({
            ...before,
            x: before.x - (sameLocation ? 0 : 1),
        })
        expect(damageEvents(caster, target)).toHaveLength(0)

        vi.advanceTimersByTime(300)
        expect(damageEvents(caster, target)).toHaveLength(1)
        expect(target.actor.hp).toBeLessThan(target.actor.maxHp)
        const practice = caster.actor.progression.masteries.magic.experience
        expect(practice).toBeGreaterThan(0n)
        stop(walker, request)
        vi.advanceTimersByTime(200)
        expect(damageEvents(caster, target)).toHaveLength(1)
        expect(caster.actor.mana).toBe(paidMana)
        expect(caster.actor.progression.masteries.magic.experience).toBe(
            practice
        )
    },
    30_000
)
