import { ABILITY_DEFINITIONS, bladeAbilityIds, type HeroClass } from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import InventoryOverlay from '@/pages/gameplay/ui/InventoryOverlay.vue'

import { characterFixture } from '../../../game/testing/characterFixture'
import ActionHotbar from '../ui/ActionHotbar.vue'
import { bindingUnavailable } from './hotbarActions'
import { actionTooltip } from './hotbarPresentation'

it.each<HeroClass>(['vanguard', 'ranger', 'arcanist', 'cleric'])(
    'names the same backup knife for %s without creating a bag item',
    (heroClass) => {
        const player = characterFixture(`knife-${heroClass}`, { heroClass })
        const view = mount(ActionHotbar, {
            props: { player, characters: [player], blocked: false },
        })
        try {
            expect(view.get('.hotbar-slot').attributes('aria-label')).toContain('Удар ножом')
            expect(view.get('.hotbar-slot').attributes('title')).toContain('походным ножом')
            expect(player.inventory).toEqual([])
        } finally {
            view.unmount()
        }
    }
)

it('projects the equipped weapon name and prevents a broken weapon from becoming a free knife', () => {
    const player = characterFixture('weapons')
    const props = { player, characters: [player], blocked: false }
    player.equipment.weapon = { itemId: 'old_sword', instanceId: 'sword', durability: 0 }
    expect(actionTooltip({ kind: 'attack' }, props)).toBe('Удар мечом')
    expect(bindingUnavailable({ kind: 'attack' }, props, 0, undefined, 0)).toContain('сломано')
    player.equipment.weapon = { itemId: 'axe', instanceId: 'axe' }
    expect(actionTooltip({ kind: 'attack' }, props)).toBe('Удар топором')
    expect(
        bindingUnavailable({ kind: 'ability', id: 'wide_swing' }, props, 0, undefined, 0)
    ).toContain('нож или меч')
})

it('does not submit an untargeted attack with a broken weapon', () => {
    const player = characterFixture('broken-untargeted')
    player.equipment.weapon = { itemId: 'old_sword', instanceId: 'sword', durability: 0 }
    const view = mount(ActionHotbar, {
        props: { player, characters: [player], blocked: false },
    })
    try {
        view.vm.activate(0)
        expect(view.emitted('command')).toBeUndefined()
    } finally {
        view.unmount()
    }
})

it('assigns all five learned techniques and toggles guard without enabling automatic repetition', async () => {
    const player = characterFixture('techniques', {
        abilities: { known: [...bladeAbilityIds], cooldowns: {}, casting: null, barrier: null },
    })
    for (const id of bladeAbilityIds) player.resourceChecks!.abilities[id] = 'ready'
    const view = mount(ActionHotbar, { props: { player, characters: [player], blocked: false } })
    try {
        await view.vm.edit(3)
        for (const id of bladeAbilityIds)
            expect(
                view
                    .findAll('.hotbar-picker button')
                    .some((button) => button.text().includes(ABILITY_DEFINITIONS[id].name))
            ).toBe(true)
        await view
            .findAll('.hotbar-picker button')
            .find((button) => button.text().includes('Глухая оборона'))!
            .trigger('click')
        view.vm.activate(3)
        await view.setProps({
            player: {
                ...player,
                combat: { defensiveStance: true },
                abilities: { ...player.abilities!, cooldowns: { defensive_stance: 1000 } },
            },
        })
        expect(view.findAll('.hotbar-slot')[3]!.attributes('aria-pressed')).toBe('true')
        expect(view.find('[aria-label="Автоповтор"]').exists()).toBe(false)
        view.vm.activate(3)
        expect(view.emitted('command')).toEqual([
            [{ type: 'use_ability', abilityId: 'defensive_stance' }],
            [{ type: 'use_ability', abilityId: 'defensive_stance' }],
        ])
        expect(view.text()).toContain('Движение, атаки и колдовство недоступны')
        await view.setProps({
            player: {
                ...player,
                combat: { defensiveStance: true },
                cooldowns: { attackMsLeft: 0, respawnMsLeft: 0, stunMsLeft: 500 },
            },
        })
        view.vm.activate(3)
        expect(view.emitted('command')).toHaveLength(2)
    } finally {
        view.unmount()
    }
})

it('explains the virtual knife in the empty equipment slot and preserves it after inspection', async () => {
    const character = characterFixture('empty-weapon')
    const view = mount(InventoryOverlay, { props: { character, chests: [] } })
    try {
        const knife = view.get('[aria-label="Походный нож"]')
        expect(knife.element.tagName.toLowerCase()).toBe('svg')
        const slot = knife.element.closest('button')!
        expect(slot.title).toContain('Такой нож есть у каждого героя')
        await view.get('.equipment-slot').trigger('click')
        expect(view.emitted('equipmentAction')).toBeUndefined()
        expect(character.inventory).toEqual([])
    } finally {
        view.unmount()
    }
})
