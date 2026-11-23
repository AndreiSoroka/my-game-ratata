import {
    type AshRiteMessage,
    MASTERY_XP_SCALE,
    type SkeletonOrder,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import {
    handleAbilityCommand,
    parseAbilityCommand,
} from '../src/game/abilityCommands'
import { AshRites } from '../src/game/ashRites'
import { ashSkeletonOrder, ashSummoner } from '../src/game/ashSkeletonState'
import { GameCharacter } from '../src/game/character'
import { restoreCharacter } from '../src/game/characterRecovery'
import { CompanionService } from '../src/game/companions'
import { syncAbilityConstellations } from '../src/game/constellations'
import type { CharacterController } from '../src/game/controllers'
import { canTargetByFaction } from '../src/game/factions'
import { createItemInstance } from '../src/game/inventory'
import { WorldLocations } from '../src/game/worldLocations'
import { chestNavigation, now } from './chestTestHelpers'

const bonesId = 'test-ash-bones'
const origin = { x: 96, y: 96 }

function fighter(
    id: string,
    archetype: 'human' | 'skeleton' | 'slime' = 'human',
    mortal = false,
    allegiance: { faction?: GameCharacter['faction']; ashPact?: boolean } = {}
) {
    return new GameCharacter({
        id,
        nickname: id,
        archetype,
        mortal,
        respawnPolicy: 'none',
        controllerKind: 'mob1',
        faction: archetype === 'slime' ? 'monsters' : 'peaceful',
        spawnPosition: { ...origin, x: archetype === 'human' ? 80 : 112 },
        ...allegiance,
    })
}

function study(actor: GameCharacter, level: number, xp = 0) {
    actor.abilities.known.add('pray_grave')
    actor.progression.masteries.prayer_grave = {
        level,
        experience: BigInt(xp) * MASTERY_XP_SCALE,
    }
    syncAbilityConstellations(actor)
}

function scenario(...actors: GameCharacter[]) {
    const world = new WorldLocations(chestNavigation())
    const characters = new Map(actors.map((actor) => [actor.id, actor]))
    const controllers = new Map<string, CharacterController>()
    const rites = new AshRites(
        () => world,
        characters,
        controllers,
        new CompanionService(),
        () => []
    )
    const location = world.get()
    return {
        characters,
        inventory: location.inventory,
        rites,
        use(
            actor: GameCharacter,
            message: Omit<AshRiteMessage, 'type'> & { order?: SkeletonOrder },
            at: number
        ) {
            const command = parseAbilityCommand({
                ...message,
                type: 'use_ability',
            })
            if (command === undefined) {
                throw new Error('Malformed test command')
            }
            return handleAbilityCommand(actor, command, {
                characters: [...characters.values()],
                navigation: location.navigation,
                now: at,
                useAshRite: rites.use,
            })
        },
    }
}

describe('shared Ash rites', () => {
    it('starts, revalidates and consumes shared remains once, without consuming the corpse loot', () => {
        const first = fighter('first')
        const second = fighter('second')
        const fallen = fighter('fallen', 'skeleton', true)
        const loot = createItemInstance('old_sword')
        fallen.inventory = [loot]
        const f = scenario(first, second, fallen)
        study(first, 2)
        study(second, 2)
        fallen.applyDamage(fallen.hp, now)
        const targetId = `corpse:${fallen.id}:${String(fallen.deathSequence)}`
        const message = { abilityId: 'ash_raise', targetId } as const
        const readyAt = fallen.reviveUntil
        expect(f.inventory.finalizeDeath(fallen, readyAt - 1)).toEqual([])
        expect(f.use(first, message, readyAt - 1)).toMatchObject([
            { kind: 'notice' },
        ])
        expect(f.inventory.finalizeDeath(fallen, readyAt)).toMatchObject([
            { kind: 'item_drop' },
        ])

        const firstMana = first.mana
        const secondMana = second.mana
        expect(f.use(first, message, readyAt)).toMatchObject([
            { kind: 'cast', phase: 'started' },
        ])
        expect(f.use(second, message, readyAt)).toMatchObject([
            { kind: 'cast', phase: 'started' },
        ])
        expect(f.rites.advance(readyAt + 2499)).toEqual([])
        const completeAt = readyAt + 2500
        expect(f.rites.advance(completeAt)).toMatchObject([
            { phase: 'completed' },
            { phase: 'interrupted' },
        ])
        expect(first.mana).toBe(firstMana - 15)
        expect(second.mana).toBe(secondMana)
        expect(first.progression.masteries.prayer_grave.experience).toBe(
            70n * MASTERY_XP_SCALE
        )
        expect(second.progression.masteries.prayer_grave.experience).toBe(0n)
        expect(
            f.inventory.deathLoot.raisableRemains(targetId, completeAt)
        ).toBeUndefined()
        f.inventory.openChestById(first, targetId, completeAt)
        expect(
            f.inventory.containers.snapshot(first, completeAt)?.items
        ).toEqual([loot])

        const raised = [...f.characters.values()].find(
            (actor) => ashSummoner(actor) === first.id
        )
        if (raised === undefined) {
            throw new Error('Ritual did not register the skeleton')
        }
        expect(raised).toMatchObject({
            creatureType: 'undead',
            archetype: 'skeleton',
        })
        expect(raised.hp).toBe(Math.ceil(raised.maxHp * 0.5))
        f.rites.advance(completeAt + 60_000)
        expect(f.characters.has(raised.id)).toBe(false)
    })

    it('preserves prepared remains and mana when the channel is interrupted', () => {
        const caster = fighter('caster')
        const f = scenario(caster)
        study(caster, 2)
        f.inventory.deathLoot.seedRemains(bonesId, origin)
        const message = { abilityId: 'ash_raise', targetId: bonesId } as const
        const mana = caster.mana
        f.use(caster, message, now)
        caster.applyDamage(1, now + 1)
        expect(f.rites.advance(now + 1)).toMatchObject([
            { phase: 'interrupted' },
        ])
        expect(caster.mana).toBe(mana)
        expect(
            f.inventory.snapshotChests().some((chest) => chest.id === bonesId)
        ).toBe(false)
        expect(
            f.inventory
                .snapshotChests(now + 1, caster)
                .some(
                    (chest) => chest.id === bonesId && chest.raisable === true
                )
        ).toBe(true)
    })
})

describe('skeleton orders and gifts', () => {
    it('limits orders to three and requires explicit slime hunting', () => {
        const caster = fighter('caster')
        const one = fighter('one', 'skeleton')
        const two = fighter('two', 'skeleton')
        const three = fighter('three', 'skeleton')
        const four = fighter('four', 'skeleton')
        const slime = fighter('slime', 'slime')
        const f = scenario(caster, one, two, three, four, slime)
        study(caster, 3)
        const command = (target: GameCharacter, order: SkeletonOrder) =>
            f.use(
                caster,
                { abilityId: 'ash_order', targetId: target.id, order },
                now
            )
        expect(canTargetByFaction(one, slime, now)).toBe(false)
        expect(command(one, 'hunt_slimes')).toMatchObject([{ kind: 'chat' }])
        expect(canTargetByFaction(one, slime, now)).toBe(true)
        command(two, 'guard')
        command(three, 'guard')
        expect(command(four, 'guard')).toMatchObject([{ kind: 'notice' }])
        expect(ashSkeletonOrder(four)).toBeUndefined()
        command(one, 'wander')
        expect(canTargetByFaction(one, slime, now)).toBe(false)
        expect(command(four, 'guard')).toMatchObject([{ kind: 'chat' }])
    })

    it('transfers both prices once and retains the chosen HP bonus after a true revival', () => {
        const caster = fighter('caster')
        const shallow = fighter('shallow', 'skeleton')
        const deep = fighter('deep', 'skeleton')
        const f = scenario(caster, shallow, deep)
        const shallowBase = shallow.baseMaxHp
        const deepBase = deep.baseMaxHp
        study(caster, 10, 70)
        const gift = { abilityId: 'ash_gift', targetId: shallow.id } as const
        expect(f.use(caster, gift, now)).toMatchObject([
            { kind: 'cast', phase: 'completed' },
        ])
        expect(caster.progression.masteries.prayer_grave).toEqual({
            level: 10,
            experience: 0n,
        })
        expect(shallow.baseMaxHp).toBeCloseTo(shallowBase * 1.1)
        expect(shallow.progression.masteries.life.experience).toBe(
            70n * MASTERY_XP_SCALE
        )
        expect(f.use(caster, gift, now)).toMatchObject([{ kind: 'notice' }])
        const sacrifice = {
            abilityId: 'ash_sacrifice',
            targetId: deep.id,
        } as const
        expect(f.use(caster, sacrifice, now)).toEqual(
            expect.arrayContaining([expect.objectContaining({ kind: 'cast' })])
        )
        expect(caster.progression.masteries.prayer_grave.level).toBe(9)
        expect(deep.progression.masteries.life.level).toBe(2)
        deep.applyDamage(deep.hp, now)
        restoreCharacter(deep, now + 100, false)
        expect(deep.baseMaxHp).toBeCloseTo(deepBase * 1.2)
    })
})

it('keeps wild undead friendly when a pact holder commands or raises a skeleton', () => {
    const keeper = fighter('keeper', 'human', false, { ashPact: true })
    const bound = fighter('bound', 'skeleton', false, { faction: 'monsters' })
    const wild = fighter('wild', 'skeleton', false, { faction: 'monsters' })
    const f = scenario(keeper, bound, wild)
    study(keeper, 3)
    expect(
        f.use(
            keeper,
            { abilityId: 'ash_order', targetId: bound.id, order: 'guard' },
            now
        )
    ).toMatchObject([{ kind: 'chat' }])
    expect(canTargetByFaction(bound, wild, now)).toBe(false)
    expect(canTargetByFaction(wild, bound, now)).toBe(false)
    f.inventory.deathLoot.seedRemains(bonesId, origin)
    f.use(keeper, { abilityId: 'ash_raise', targetId: bonesId }, now)
    f.rites.advance(now + 2500)
    const raised = [...f.characters.values()].find(
        (actor) => ashSummoner(actor) === keeper.id
    )
    if (raised === undefined) {
        throw new Error('Ritual did not register the skeleton')
    }
    expect(canTargetByFaction(raised, wild, now)).toBe(false)
    expect(canTargetByFaction(wild, raised, now)).toBe(false)
})
