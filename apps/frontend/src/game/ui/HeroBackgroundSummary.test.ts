import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import { HeroBackgroundSummary } from '@/entities/character-window'
import CharacterDevelopment from '@/pages/gameplay/ui/CharacterDevelopment.vue'
import CharacterStats from '@/pages/gameplay/ui/CharacterStats.vue'

import JoinGamePanel from '../../pages/start-game/ui/JoinGamePanel.vue'
import { characterFixture } from '../testing/characterFixture'

it.each([
    ['vanguard', '+20 к здоровью', '+20 к энергии'],
    ['ranger', '+10 к здоровью', '+20 к энергии'],
    ['arcanist', '+30 к мане', 'Магия'],
    ['cleric', 'Без прибавки ресурсов', 'всех молитвенных школ'],
] as const)('shows the fixed %s background bonuses at creation', (heroClass, first, second) => {
    const view = mount(JoinGamePanel, {
        props: { nickname: 'Новый герой', heroClass, canJoin: true, errorMessage: '' },
    })
    expect(view.get('[aria-label="Постоянные бонусы прошлого"]').text()).toContain(first)
    expect(view.get('[aria-label="Постоянные бонусы прошлого"]').text()).toContain(second)
    expect(view.text()).not.toContain('Начальные запасы до звёзд')
    expect(view.text()).toContain('+20% опыта')
    view.unmount()
})

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
