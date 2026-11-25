import {
    type CharacterSnapshot,
    type PrayerAbilityId,
    prayerAbilityIds,
    previewPrayerFromSnapshots,
} from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import ActionHotbar from '../../pages/gameplay/ui/ActionHotbar.vue'
import { trainingPrayerHighlight } from '../runtime/trainingGuides'
import { characterFixture } from '../testing/characterFixture'
import { developmentCharacterFixture } from '../testing/developmentFixture'
import { graveFixture } from '../testing/graveFixture'
import { gravePrayerPreview } from './graveInteractions'
import { prayerLearningActions } from './nearbyCharacterActions'
import { preferredPrayer } from './prayerSelection'

function allPrayers(): CharacterSnapshot {
    const player = developmentCharacterFixture()
    player.abilities = {
        known: [...prayerAbilityIds],
        cooldowns: {},
        casting: null,
        barrier: null,
        prayers: Object.fromEntries(
            prayerAbilityIds.map((id, index) => [
                id,
                {
                    radius: 48 + index * 16,
                    durationMs: 3000,
                    manaCost: 5,
                    area: false,
                    harm: false,
                },
            ])
        ),
    }
    player.health = { kind: 'exact', current: 10, max: 20 }
    player.resources = {
        energy: { kind: 'exact', current: 10, max: 100 },
        mana: { kind: 'exact', current: 10, max: 40 },
    }
    return player
}
it('resolves each spell by its school even when primary affiliation differs', () => {
    const player = allPrayers()
    player.progression!.deity.id = 'grave'
    const undead = characterFixture('undead', {
        creatureType: 'undead',
        health: { kind: 'exact', current: 5, max: 20 },
        resources: {
            mana: { kind: 'percent', percent: 40, hasCapacity: true },
            energy: { kind: 'percent', percent: 40, hasCapacity: true },
        },
    })
    expect(
        previewPrayerFromSnapshots(player, [undead], player.id, { abilityId: 'pray' }).intent
    ).toEqual({ mode: 'restore', targetId: player.id })
    expect(
        previewPrayerFromSnapshots(player, [undead], undead.id, { abilityId: 'pray' }).intent
    ).toEqual({ mode: 'devotion' })
    for (const abilityId of ['pray_road', 'pray_lantern', 'pray_grave'] as const) {
        const preview = previewPrayerFromSnapshots(player, [undead], undead.id, { abilityId })
        expect(preview.intent).toEqual({ mode: 'restore', targetId: undead.id })
        expect(preview.abilityId).toBe(abilityId)
    }
})
it.each(['pray_road', 'pray_lantern', 'pray_grave'] as const)(
    'rejects a pinned grave for %s without substituting an injured ally',
    (abilityId) => {
        const player = allPrayers(),
            grave = graveFixture()
        const preview = previewPrayerFromSnapshots(player, [], grave.id, {
            abilityId,
            graves: [grave],
        })
        expect(preview.intent).toBeNull()
        expect(preview.unavailableReason).toBe('Эта молитва не очищает могилы.')
        expect(gravePrayerPreview(player, grave, true, [], undefined, abilityId).intent).toBeNull()
    }
)
it('checks learning, cooldown and affordability per school', () => {
    const player = allPrayers()
    player.abilities!.cooldowns.pray = 1000
    player.resourceChecks!.prayers.pray.restore = 'mana'
    expect(
        previewPrayerFromSnapshots(player, [], player.id, { abilityId: 'pray' }).unavailableReason
    ).toBeTruthy()
    expect(
        previewPrayerFromSnapshots(player, [], player.id, { abilityId: 'pray_road' })
            .unavailableReason
    ).toBeNull()
    player.abilities!.known = ['pray_road']
    expect(
        previewPrayerFromSnapshots(player, [], player.id, { abilityId: 'pray_lantern' })
            .unavailableReason
    ).toBe('Молитва не изучена.')
})
it('teaches only exact spells attained by the selected living teacher', () => {
    const student = characterFixture('student'),
        teacher = allPrayers()
    expect(prayerLearningActions(teacher, student).map((action) => action.command)).toEqual(
        prayerAbilityIds.map((abilityId) => ({
            type: 'learn_ability',
            abilityId,
            targetId: teacher.id,
        }))
    )
    teacher.abilities!.known = ['pray']
    expect(prayerLearningActions(teacher, student)).toHaveLength(1)
    teacher.alive = false
    expect(prayerLearningActions(teacher, student)).toEqual([])
})
it('chooses the training radius from casting, auto, last use, healing, then first known', () => {
    const player = allPrayers()
    expect(preferredPrayer(player)).toBe('pray')
    player.abilities!.lastPrayerAbilityId = 'pray_road'
    expect(preferredPrayer(player)).toBe('pray_road')
    player.control = {
        mode: 'action',
        targetId: null,
        action: { kind: 'prayer', abilityId: 'pray_lantern', intent: { mode: 'devotion' } },
        waiting: null,
    }
    expect(preferredPrayer(player)).toBe('pray_lantern')
    player.abilities!.casting = {
        abilityId: 'pray_grave',
        mode: 'restore',
        targetId: 'undead',
        startedAt: 0,
        completesAt: 3000,
    }
    expect(trainingPrayerHighlight(player)).toMatchObject({ abilityId: 'pray_grave', radius: 96 })
    player.abilities!.casting = null
    player.control = { mode: 'none', targetId: null }
    delete player.abilities!.lastPrayerAbilityId
    player.abilities!.known = ['pray_lantern']
    expect(preferredPrayer(player)).toBe('pray_lantern')
})
it('binds four separate slots and pins the school in single and repeated prayer commands', async () => {
    const player = allPrayers()
    player.health = { kind: 'percent', percent: 100 }
    player.resources = {
        mana: { kind: 'percent', percent: 100, hasCapacity: true },
        energy: { kind: 'percent', percent: 100, hasCapacity: true },
    }
    const view = mount(ActionHotbar, { props: { player, characters: [], blocked: false } })
    try {
        for (const [index, abilityId] of prayerAbilityIds.entries()) {
            await view.vm.edit(index)
            await view.findAll('.hotbar-picker [data-dialog-action]')[index]!.trigger('click')
            view.vm.activate(index)
            const intent =
                abilityId === 'pray_road'
                    ? { mode: 'restore', targetId: player.id }
                    : { mode: 'devotion' }
            expect(view.emitted('command')?.at(-1)).toEqual([
                { type: 'use_ability', abilityId, intent },
            ])
        }
        const abilityId: PrayerAbilityId = 'pray_grave'
        view.vm.activate(3)
        expect(view.emitted('command')?.at(-1)).toEqual([
            {
                type: 'auto_action',
                action: { kind: 'prayer', abilityId, intent: { mode: 'devotion' } },
            },
        ])
    } finally {
        view.unmount()
    }
})

it('casts only the selected hostile at the fixed Ash Brand range through the ordinary hotbar', async () => {
    const player = allPrayers()
    player.abilities!.prayers!.pray_grave!.harm = true
    player.abilities!.prayers!.pray_grave!.targetLimit = 2
    const enemy = characterFixture('ash-brand', {
        creatureType: 'ooze',
        faction: 'monsters',
        relationship: 'hostile',
        position: { x: player.position.x + 40, y: player.position.y },
    })
    const other = { ...enemy, id: 'other' }
    const friend = { ...enemy, id: 'friendly', relationship: 'friendly' as const }
    const far = {
        ...enemy,
        id: 'far',
        position: { x: player.position.x + 70, y: player.position.y },
    }
    const characters = [enemy, other, friend, far]
    const options = { abilityId: 'pray_grave' as const }
    expect(previewPrayerFromSnapshots(player, characters, enemy.id, options)).toMatchObject({
        intent: { mode: 'harm', targetId: enemy.id },
        harmfulTargetIds: [enemy.id],
        radius: 48,
        durationMs: 1500,
    })
    for (const excluded of [friend, far]) {
        expect(previewPrayerFromSnapshots(player, characters, excluded.id, options).intent).toEqual(
            { mode: 'devotion' }
        )
    }
    const view = mount(ActionHotbar, {
        props: { player, target: enemy, characters, blocked: false },
    })
    try {
        await view.vm.edit(0)
        await view.findAll('.hotbar-picker [data-dialog-action]')[3]!.trigger('click')
        view.vm.activate(0)
        expect(view.emitted('command')?.at(-1)).toEqual([
            {
                type: 'use_ability',
                abilityId: 'pray_grave',
                intent: { mode: 'harm', targetId: enemy.id },
            },
        ])
    } finally {
        view.unmount()
    }
})

it('previews Ash revival with its own reach and shows the second heal only when affordable', () => {
    const player = allPrayers()
    const prayers = player.abilities!.prayers!
    prayers.pray_grave!.ashRevival = { radius: 64, durationMs: 2700 }
    prayers.pray_grave!.targetLimit = 2
    player.progression!.resurrectionSchools = ['pray_grave']
    const dead = characterFixture('fallen', {
        alive: false,
        creatureType: 'undead',
        position: { x: player.position.x + 63, y: player.position.y },
        life: { retired: false, reviveMsLeft: 60_000, reviveUntil: 60_000 },
    })
    const options = { abilityId: 'pray_grave' as const }
    expect(previewPrayerFromSnapshots(player, [dead], dead.id, options)).toMatchObject({
        intent: { mode: 'revive', targetId: dead.id },
        manaCost: 20,
        radius: 64,
        durationMs: 2700,
    })
    dead.position.x += 2
    expect(previewPrayerFromSnapshots(player, [dead], dead.id, options).intent).toEqual({
        mode: 'devotion',
    })
    const living = [1, 2].map((id) =>
        characterFixture(String(id), {
            creatureType: 'undead',
            health: { kind: 'percent', percent: 50 },
        })
    )
    player.resourceChecks!.ashSecondHeal = false
    expect(previewPrayerFromSnapshots(player, living, living[0]!.id, options)).toMatchObject({
        manaCost: 5,
        targetCount: 1,
    })
    player.resourceChecks!.ashSecondHeal = true
    expect(previewPrayerFromSnapshots(player, living, living[0]!.id, options)).toMatchObject({
        manaCost: 10,
        targetCount: 2,
    })
})
