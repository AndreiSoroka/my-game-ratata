import {
    type CharacterSnapshot,
    type PrayerAbilityId,
    prayerAbilityIds,
    previewPrayerFromSnapshots,
} from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import { trainingPrayerHighlight } from '../runtime/trainingGuides'
import { characterFixture } from '../testing/characterFixture'
import { developmentCharacterFixture } from '../testing/developmentFixture'
import { graveFixture } from '../testing/graveFixture'
import ActionHotbar from './ActionHotbar.vue'
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
            expect(view.emitted('command')?.at(-1)).toEqual([
                { type: 'use_ability', abilityId, intent: { mode: 'devotion' } },
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
