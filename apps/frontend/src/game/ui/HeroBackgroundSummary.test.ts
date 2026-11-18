import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import { characterFixture } from '../testing/characterFixture'
import CharacterDevelopment from './CharacterDevelopment.vue'
import CharacterStats from './CharacterStats.vue'
import HeroBackgroundSummary from './HeroBackgroundSummary.vue'
import JoinGamePanel from './JoinGamePanel.vue'

it.each([
    ['vanguard', '+20 к здоровью', '+20 к энергии', '50 HP · 120 энергии · 40 маны'],
    ['ranger', '+10 к здоровью', '+20 к энергии', '40 HP · 120 энергии · 40 маны'],
    ['arcanist', '+30 к мане', 'Магия', '30 HP · 100 энергии · 70 маны'],
    ['cleric', 'Без прибавки ресурсов', 'всех молитвенных школ', '30 HP · 100 энергии · 40 маны'],
] as const)(
    'shows the fixed %s background bonuses at creation',
    (heroClass, first, second, initial) => {
        const view = mount(JoinGamePanel, {
            props: { nickname: 'Новый герой', heroClass, canJoin: true, errorMessage: '' },
        })
        expect(view.get('[aria-label="Постоянные бонусы прошлого"]').text()).toContain(first)
        expect(view.get('[aria-label="Постоянные бонусы прошлого"]').text()).toContain(second)
        expect(view.text()).toContain(initial)
        expect(view.text()).toContain('+20% опыта')
        view.unmount()
    }
)

it('updates bonuses with the radio selection instead of retaining the previous background', async () => {
    const view = mount(JoinGamePanel, {
        props: { nickname: 'Новый герой', heroClass: 'vanguard', canJoin: true, errorMessage: '' },
    })
    await view.setProps({ heroClass: 'arcanist' })
    const details = view.get('[aria-label="Постоянные бонусы прошлого"]').text()
    expect(details).toContain('+30 к мане')
    expect(details).not.toContain('+20 к здоровью')
    view.unmount()
})

it.each([CharacterStats, CharacterDevelopment])(
    'shows permanent bonuses alongside personal observations',
    (component) => {
        const view = mount(component, {
            props: {
                player: characterFixture('background-hero', { heroClass: 'cleric' }),
                characters: [],
            },
        })
        expect(view.get('[aria-label="Постоянные бонусы прошлого"]').text()).toContain(
            'Прошлое: Клирик'
        )
        expect(view.text()).toContain('+20% опыта всех молитвенных школ')
        expect(view.text()).not.toContain('Начальные запасы до звёзд:')
        view.unmount()
    }
)

it('keeps absent backgrounds absent rather than guessing from the displayed character', () => {
    const view = mount(HeroBackgroundSummary)
    expect(view.find('[aria-label="Постоянные бонусы прошлого"]').exists()).toBe(false)
    view.unmount()
})

it('explains the shared backup knife in the character window only while the weapon slot is empty', async () => {
    const player = characterFixture('knife-hero', { heroClass: 'vanguard' })
    const view = mount(CharacterStats, { props: { player } })
    expect(view.get('[data-testid="backup-knife-description"]').text()).toContain('походным ножом')
    await view.setProps({
        player: {
            ...player,
            equipment: { weapon: { instanceId: 'sword', itemId: 'old_sword', durability: 100 } },
        },
    })
    expect(view.find('[data-testid="backup-knife-description"]').exists()).toBe(false)
    view.unmount()
})
