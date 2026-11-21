import { expect, it, vi } from 'vitest'

import {
    setCharacterControl,
    snapshotControl,
} from '../src/game/characterControl'
import { grantRetaliation } from '../src/game/crimeRelations'
import { parseClientMessage } from '../src/game/messages'
import { abilityHero } from './abilityTestHelpers'
import { autoActionFixture as fixture } from './autoActionTestFixture'

function resolveSwing(f: ReturnType<typeof fixture>): void {
    const hitAt = f.actor.pendingAttack?.hitAt
    if (hitAt === undefined) {
        throw new Error('Expected a scheduled attack contact')
    }
    f.resolveHit(hitAt)
}

it('parses one-shot attack commands only with a character target', () => {
    const action = { kind: 'attack', targetId: 'enemy', once: true }
    const command = { type: 'auto_action', action }
    expect(parseClientMessage(JSON.stringify(command))).toEqual({
        message: command,
    })

    for (const invalid of [
        { kind: 'attack', once: true },
        { ...action, targetId: ' ' },
        {
            kind: 'attack',
            target: { kind: 'grave', id: 'grave' },
            once: true,
        },
        { ...action, target: { kind: 'grave', id: 'grave' } },
        { ...action, once: false },
        {
            kind: 'ability',
            abilityId: 'spark',
            targetId: 'enemy',
            once: true,
        },
    ]) {
        expect(
            parseClientMessage(JSON.stringify({ ...command, action: invalid }))
        ).toHaveProperty('error')
    }
})

it('approaches, waits for cooldown and commits one ordinary swing at low energy', () => {
    const f = fixture('vanguard')
    f.hostile()
    f.target.position.x = 148
    f.actor.combat.readyAt = 1400
    f.actor.energy = 0
    const action = {
        kind: 'attack',
        targetId: f.target.id,
        once: true,
    } as const

    expect(f.enable(action)).toBe(true)
    f.tick(1000)
    expect(snapshotControl(f.actor)).toMatchObject({
        action,
        waiting: 'range',
    })
    expect(f.actor.hasPath()).toBe(true)
    expect(f.events).toEqual([])

    f.target.position.x = 112
    f.tick(1399)
    expect(snapshotControl(f.actor).waiting).toBe('cooldown')
    expect(f.actor.hasPath()).toBe(false)
    expect(f.events).toEqual([])
    f.tick(1400)
    expect(f.actor.pendingAttack).toMatchObject({
        targetId: f.target.id,
        underpowered: true,
    })
    expect(snapshotControl(f.actor).mode).toBe('none')

    resolveSwing(f)
    f.tick(f.actor.combat.readyAt + 1)
    expect(f.events.filter((event) => event.kind === 'attack')).toHaveLength(1)
    expect(f.events.filter((event) => event.kind === 'damage')).toHaveLength(1)
})

it.each(['approaching', 'in windup'] as const)(
    'upgrades to repeat while %s without adding an immediate swing',
    (phase) => {
        const f = fixture('vanguard')
        f.hostile()
        f.target.position.x = phase === 'approaching' ? 148 : 112
        const repeat = { kind: 'attack', targetId: f.target.id } as const
        expect(f.enable({ ...repeat, once: true })).toBe(true)
        f.tick(1000)
        const started = f.actor.pendingAttack

        expect(f.enable(repeat, 1100)).toBe(true)
        expect(snapshotControl(f.actor)).toMatchObject({ action: repeat })
        expect(f.actor.pendingAttack).toBe(started)
        f.target.position.x = 112
        f.tick(1100)
        expect(
            f.events.filter((event) => event.kind === 'attack')
        ).toHaveLength(1)

        const readyAt = f.actor.combat.readyAt
        resolveSwing(f)
        f.tick(readyAt - 1)
        expect(
            f.events.filter((event) => event.kind === 'attack')
        ).toHaveLength(1)
        f.tick(readyAt)
        expect(
            f.events.filter((event) => event.kind === 'attack')
        ).toHaveLength(2)
    }
)

it.each(['cancelled', 'hidden', 'unreachable'] as const)(
    'stops a %s approach without swinging or choosing a replacement',
    (reason) => {
        const f = fixture('vanguard')
        f.hostile()
        f.target.position.x = 148
        const neighbor = abilityHero('vanguard')
        neighbor.position.x = 112
        grantRetaliation(f.actor, neighbor, 60_000)
        f.characters.push(neighbor)

        expect(
            f.enable({ kind: 'attack', targetId: f.target.id, once: true })
        ).toBe(true)
        f.tick(1000)
        expect(f.actor.hasPath()).toBe(true)
        if (reason === 'cancelled') {
            setCharacterControl(
                f.actor,
                { type: 'cancel_control' },
                f.world,
                1001
            )
        } else if (reason === 'hidden') {
            vi.spyOn(f.context.navigation, 'hasLineOfSight').mockImplementation(
                (_from, to) => to !== f.target.position
            )
        } else {
            vi.spyOn(f.context.navigation, 'findPathWorld').mockReturnValue([])
        }

        expect(f.tick(1400)).toBe(false)
        expect(snapshotControl(f.actor).mode).toBe('none')
        expect(f.actor.hasPath()).toBe(false)
        expect(f.events).toEqual([])
    }
)
