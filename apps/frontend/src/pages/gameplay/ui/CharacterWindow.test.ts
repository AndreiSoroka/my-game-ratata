import { flushPromises, mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import { adventureFixture, worldFixture } from '@/game/testing/characterFixture'
import { developmentCharacterFixture, fixtureStarId } from '@/game/testing/developmentFixture'

import {
    observedDamageText,
    observedResourceText,
    observedText,
} from '../model/characterSheetPresentation'
import CharacterWindow from './CharacterWindow.vue'

it('renders only server estimates and distinguishes absent resources', () => {
    expect(observedText({ kind: 'range', lower: 50, upper: 100 })).toBe('≈50–100')
    expect(
        observedResourceText({
            current: { kind: 'range', lower: 0, upper: 50 },
            max: { kind: 'range', lower: 50, upper: 100 },
            hasCapacity: true,
        })
    ).toBe('≈0–50 / ≈50–100')
    expect(
        observedResourceText({
            current: { kind: 'exact', value: 0 },
            max: { kind: 'exact', value: 0 },
            hasCapacity: false,
        })
    ).toBe('Нет')
    expect(
        observedDamageText({ min: { kind: 'exact', value: 2 }, max: { kind: 'exact', value: 5 } })
    ).toBe('2–5')
})
it('owns physical P, tabs, Escape after lost focus, and suppresses held P', async () => {
    const view = mount(CharacterWindow, {
        props: { player: developmentCharacterFixture(), characters: [] },
        attachTo: document.body,
    })
    try {
        await flushPromises()
        expect(document.activeElement?.textContent?.trim()).toBe('Характеристики')
        await view.get('[role="tab"]').trigger('keydown', { code: 'ArrowRight' })
        expect(view.emitted('update:tab')?.at(-1)).toEqual(['development'])
        await view.setProps({ tab: 'development' })
        expect(view.find('[aria-label="Созвездия развития"]').exists()).toBe(true)
        const node = view.get(`[data-node-id="${fixtureStarId('prayer.root')}"]`)
        ;(node.element as SVGGElement).focus()
        await node.trigger('keydown', { code: 'Tab' })
        expect(document.activeElement).not.toBe(node.element)
        expect(view.element.contains(document.activeElement)).toBe(true)
        window.dispatchEvent(
            new KeyboardEvent('keydown', { code: 'KeyP', key: 'з', repeat: true, cancelable: true })
        )
        expect(view.emitted('close')).toBeUndefined()
        window.dispatchEvent(
            new KeyboardEvent('keydown', { code: 'KeyP', key: 'з', cancelable: true })
        )
        expect(view.emitted('close')).toHaveLength(1)
        document.body.tabIndex = -1
        document.body.focus()
        document.body.dispatchEvent(
            new KeyboardEvent('keydown', { code: 'Escape', bubbles: true, cancelable: true })
        )
        expect(view.emitted('close')).toHaveLength(2)
    } finally {
        view.unmount()
        document.body.removeAttribute('tabindex')
    }
})
it('does not intercept P in a text editor', async () => {
    const view = mount(CharacterWindow, {
        props: { player: developmentCharacterFixture(), characters: [] },
        attachTo: document.body,
    })
    const input = document.createElement('input')
    document.body.append(input)
    try {
        input.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP', bubbles: true }))
        await flushPromises()
        expect(view.emitted('close')).toBeUndefined()
    } finally {
        view.unmount()
        input.remove()
    }
})

it('keeps physical WASD in the character modal, including the quests tab', async () => {
    const view = mount(CharacterWindow, {
        props: { player: developmentCharacterFixture(), characters: [], tab: 'quests' },
        attachTo: document.body,
    })
    try {
        await flushPromises()
        const dialog = view.get('[role="dialog"]')
        const tab = view.get('[role="tab"][aria-selected="true"]')
        expect(dialog.attributes('aria-modal')).toBe('true')
        expect(dialog.attributes('data-world-movement')).toBeUndefined()
        await tab.trigger('keydown', { code: 'KeyW', key: 'ц' })
        expect(document.activeElement).toBe(view.get('.character-close').element)
        await view.get('.character-close').trigger('keydown', { code: 'KeyS', key: 'ы' })
        expect(document.activeElement).toBe(tab.element)
        await tab.trigger('keydown', { code: 'KeyD', key: 'в' })
        expect(view.emitted('update:tab')?.at(-1)).toEqual(['crafting'])
        await view.setProps({ tab: 'crafting' })
        await view.get('[role="tab"][aria-selected="true"]').trigger('keydown', {
            code: 'KeyA',
            key: 'ф',
        })
        expect(view.emitted('update:tab')?.at(-1)).toEqual(['quests'])
    } finally {
        view.unmount()
    }
})

it('keeps recipes and crafting commands in the modal character tab', async () => {
    const player = developmentCharacterFixture()
    const adventure = adventureFixture()
    adventure.materials.fiber = 3
    adventure.recipes = [
        { id: 'boots', itemId: 'boots', label: 'Сплести сапоги', cost: { fiber: 3 } },
    ]
    const view = mount(CharacterWindow, {
        props: {
            player,
            characters: [],
            snapshot: { ...worldFixture([player]), adventure },
        },
    })
    try {
        await view.get('[role="tab"]').trigger('keydown', { code: 'End' })
        expect(view.emitted('update:tab')).toEqual([['crafting']])
        await view.setProps({ tab: 'crafting' })
        expect(view.get('[role="dialog"]').attributes('aria-modal')).toBe('true')
        const crafting = view.get('[aria-labelledby="character-crafting-tab"]')
        expect(crafting.text()).toContain('Волокно: 3')
        await crafting.get('article button').trigger('click')
        expect(view.emitted('command')).toEqual([[{ type: 'craft', recipeId: 'boots' }]])
    } finally {
        view.unmount()
    }
})
