import {
    type CharacterSnapshot,
    type PrayerActionId,
    previewPrayerFromSnapshots,
    profileForPrayer,
    snapshotPrayerParameters,
} from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { choosePrayerPreviewTargets } from '../../../../../contracts/src/prayerPreviewTargets'
import { characterFixture } from '../testing/characterFixture'
import { graveFixture } from '../testing/graveFixture'
import { bindingMatchesAction, prayerDescription } from './hotbarBindings'

function caster() {
    const player = characterFixture('caster', { health: { kind: 'exact', current: 26, max: 26 } })
    player.abilities = {
        known: ['pray', 'pray_woven'],
        cooldowns: {},
        casting: null,
        barrier: null,
        prayers: {
            pray: {
                radius: 48,
                durationMs: 3000,
                manaCost: 5,
                area: false,
                harm: true,
                wardRank: 4,
            },
            pray_woven: {
                radius: 48,
                durationMs: 3000,
                manaCost: 5,
                area: true,
                harm: true,
                targetLimit: 2,
                wardRank: 4,
            },
        },
    }
    player.resourceChecks!.prayers.pray_woven = { ...player.resourceChecks!.prayers.pray }
    return player
}
function selectedPlan(
    player: CharacterSnapshot,
    characters: CharacterSnapshot[],
    selectedId: string,
    abilityId: PrayerActionId = 'pray'
) {
    return choosePrayerPreviewTargets(
        {
            player,
            abilityId,
            all: [...characters, player],
            parameters: snapshotPrayerParameters(player, abilityId),
            profile: profileForPrayer(abilityId),
            options: {},
        },
        selectedId
    ).targets
}
it('bounds Woven by unique entities and never adds collateral Kara to basic healing', () => {
    const player = caster()
    const wounded = ['first', 'second'].map((id) =>
        characterFixture(id, { health: { kind: 'exact', current: 1, max: 26 } })
    )
    const undead = characterFixture('undead', {
        archetype: 'skeleton',
        creatureType: 'undead',
        faction: 'monsters',
    })
    const simple = previewPrayerFromSnapshots(player, [...wounded, undead], wounded[0]!.id)
    expect(simple.targetCount).toBe(1)
    expect(simple.harmfulTargets).toBe(0)
    const woven = previewPrayerFromSnapshots(player, [...wounded, undead], undefined, {
        abilityId: 'pray_woven',
    })
    expect(woven.targetCount).toBe(2)
    expect(woven.harmfulTargets).toBe(0)
    player.abilities!.prayers!.pray_woven!.targetLimit = 5
    expect(
        previewPrayerFromSnapshots(player, [...wounded, undead], undefined, {
            abilityId: 'pray_woven',
        }).harmfulTargets
    ).toBe(1)
    expect(
        bindingMatchesAction(
            { kind: 'ability', id: 'pray_woven' },
            {
                kind: 'prayer',
                abilityId: 'pray_woven',
                intent: { mode: 'restore', targetId: wounded[0]!.id },
            }
        )
    ).toBe(true)
})
it('forces basic Last Light to self without publishing numeric maximum mana', () => {
    const player = caster()
    player.health = { kind: 'exact', current: 1, max: 26 }
    player.abilities!.prayers!.pray!.cost = { manaPerTarget: 5, healingManaFraction: 0.3 }
    const ally = characterFixture('ally', { health: { kind: 'exact', current: 1, max: 26 } })
    const preview = previewPrayerFromSnapshots(player, [ally], ally.id)
    expect(preview.intent).toEqual({ mode: 'restore', targetId: player.id })
    expect(preview.cost).toEqual({ manaPerTarget: 5, healingManaFraction: 0.3 })
    expect(preview.targetCount).toBe(1)
    expect(prayerDescription(preview, [ally], player)).toContain('30% максимальной MP')
})
it('charges a full aura-only channel and keeps the aura-free cosmetic prayer free', () => {
    const player = caster()
    const plain = previewPrayerFromSnapshots(player, [])
    expect(plain).toMatchObject({ intent: { mode: 'devotion' }, manaCost: 0, durationMs: 400 })
    player.abilities!.prayers!.pray!.hasAuras = true
    const aura = previewPrayerFromSnapshots(player, [])
    expect(aura).toMatchObject({ intent: { mode: 'devotion' }, manaCost: 5, durationMs: 3000 })
    expect(prayerDescription(aura, [], player)).toContain('Ауры молитвы')
    expect(prayerDescription(aura, [], player)).not.toContain('Без эффекта')
})

it('keeps an explicitly selected healthy self available for cosmetic prayer', () => {
    const player = caster()
    const preview = previewPrayerFromSnapshots(player, [], player.id)
    expect(preview).toMatchObject({
        intent: { mode: 'devotion' },
        manaCost: 0,
        durationMs: 400,
        unavailableReason: null,
    })
})

it('extends ordinary prayer to five recipients without learning Woven and keeps one miracle type', () => {
    const player = caster()
    player.abilities!.known = ['pray']
    player.abilities!.prayers!.pray!.targetLimit = 5
    const allies = ['first', 'second'].map((id) =>
        characterFixture(id, { health: { kind: 'exact', current: 1, max: 26 } })
    )
    const undead = ['undead-first', 'undead-second'].map((id) =>
        characterFixture(id, { creatureType: 'undead', faction: 'monsters' })
    )
    const heal = previewPrayerFromSnapshots(player, [...allies, ...undead], allies[0]!.id)
    expect(heal.targetCount).toBe(2)
    expect(heal.harmfulTargetIds).toEqual([])
    const harm = previewPrayerFromSnapshots(player, [...allies, ...undead], undead[0]!.id)
    expect(harm.targetCount).toBe(2)
    expect(harm.harmfulTargetIds).toEqual(['undead-first', 'undead-second'])
    player.abilities!.prayers!.pray!.harm = false
    player.resourceChecks!.prayers.pray.ward = 'ready'
    const ward = previewPrayerFromSnapshots(player, [...allies, ...undead], undead[0]!.id)
    expect(ward.intent).toEqual({ mode: 'ward', targetId: undead[0]!.id })
    expect(ward.targetCount).toBe(2)
    expect(ward.harmfulTargetIds).toEqual([])
    expect(ward.unavailableReason).toBeNull()
})
it('reserves ordinary Last Light self healing and the selected ally before nearer automatic allies', () => {
    const player = caster()
    player.abilities!.known = ['pray']
    player.health = { kind: 'exact', current: 1, max: 26 }
    player.abilities!.prayers!.pray!.targetLimit = 2
    player.abilities!.prayers!.pray!.cost = { manaPerTarget: 5, healingManaFraction: 0.3 }
    const ally = characterFixture('selected-ally', {
        health: { kind: 'exact', current: 1, max: 26 },
        position: { x: 40, y: 0 },
    })
    const nearer = characterFixture('nearer-ally', {
        health: { kind: 'exact', current: 1, max: 26 },
        position: { x: 10, y: 0 },
    })
    const preview = previewPrayerFromSnapshots(player, [nearer, ally], ally.id)
    expect(preview.intent).toEqual({ mode: 'restore', targetId: player.id })
    expect(preview.targetCount).toBe(2)
    expect(preview.harmfulTargetIds).toEqual([])
    expect(selectedPlan(player, [nearer, ally], ally.id).map((target) => target.id)).toEqual([
        player.id,
        ally.id,
    ])
})

it('keeps the manually selected Woven harm after mandatory Last Light self healing', () => {
    const player = caster()
    player.health = { kind: 'exact', current: 1, max: 26 }
    player.abilities!.prayers!.pray_woven!.cost = { manaPerTarget: 5, healingManaFraction: 0.3 }
    const ally = characterFixture('nearby-ally', {
        health: { kind: 'exact', current: 1, max: 26 },
        position: { x: 5, y: 0 },
    })
    const undead = characterFixture('selected-undead', {
        creatureType: 'undead',
        faction: 'monsters',
        position: { x: 25, y: 0 },
    })
    const preview = previewPrayerFromSnapshots(player, [ally, undead], undead.id, {
        abilityId: 'pray_woven',
    })
    expect(preview.targetCount).toBe(2)
    expect(preview.harmfulTargetIds).toEqual([undead.id])
    expect(
        selectedPlan(player, [ally, undead], undead.id, 'pray_woven').map((target) => target.id)
    ).toEqual([player.id, undead.id])
})

it('cleanses multiple graves with ordinary prayer while leaving wounded allies for a different cast', () => {
    const player = caster()
    player.abilities!.known = ['pray']
    player.abilities!.prayers!.pray!.targetLimit = 5
    const ally = characterFixture('wounded-ally', {
        health: { kind: 'exact', current: 1, max: 26 },
    })
    const graves = [graveFixture(), graveFixture({ id: 'grave:two', position: { x: 16, y: 24 } })]
    const ordinary = previewPrayerFromSnapshots(player, [ally], graves[0]!.id, { graves })
    expect(ordinary.targetCount).toBe(2)
    player.abilities!.known.push('pray_woven')
    player.abilities!.prayers!.pray_woven!.targetLimit = 5
    const woven = previewPrayerFromSnapshots(player, [ally], graves[0]!.id, {
        graves,
        abilityId: 'pray_woven',
    })
    expect(woven.targetCount).toBe(3)
})

it('resurrects several fallen allies with ordinary prayer without mixing a living heal', () => {
    const player = caster()
    player.abilities!.prayers!.pray!.targetLimit = 5
    player.abilities!.prayers!.pray_woven!.targetLimit = 5
    player.progression = {
        masteries: [],
        deity: {
            id: 'hearth',
            name: '',
            domain: '',
            omen: '',
            perception: 'vague',
            mood: null,
            successChance: null,
            changesInMs: null,
        },
        magicChaptersRead: 0,
        magicChaptersTotal: 3,
        resurrectionUnlocked: true,
        resurrectionSchools: ['pray'],
    }
    const fallen = ['fallen-first', 'fallen-second'].map((id) =>
        characterFixture(id, {
            alive: false,
            health: { kind: 'exact', current: 0, max: 26 },
            life: { retired: false, reviveUntil: 5000, reviveMsLeft: 5000 },
        })
    )
    const living = characterFixture('wounded-living', {
        health: { kind: 'exact', current: 1, max: 26 },
    })
    const ordinary = previewPrayerFromSnapshots(player, [...fallen, living], fallen[0]!.id)
    expect(ordinary.intent).toEqual({ mode: 'revive', targetId: fallen[0]!.id })
    expect(ordinary.targetCount).toBe(2)
    const woven = previewPrayerFromSnapshots(player, [...fallen, living], fallen[0]!.id, {
        abilityId: 'pray_woven',
    })
    expect(woven.targetCount).toBe(3)
})
it.each([2, 5, 20])('caps ordinary prayer at %i homogeneous recipients', (capacity) => {
    const player = caster()
    player.abilities!.known = ['pray']
    player.abilities!.prayers!.pray!.targetLimit = capacity
    const allies = Array.from({ length: 22 }, (_, index) =>
        characterFixture(`wounded-${index}`, { health: { kind: 'exact', current: 1, max: 26 } })
    )
    expect(previewPrayerFromSnapshots(player, allies, allies[0]!.id).targetCount).toBe(capacity)
})
