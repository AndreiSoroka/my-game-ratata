import { expect, it } from 'vitest'

import { fullConstellationCatalog } from '../../../../backend/src/game/constellationNodes'
import { describeConstellationUnlock } from './constellationDebugUnlock'

it('covers every star and separates mandatory eligibility from random weights', () => {
    for (const node of fullConstellationCatalog) {
        const info = describeConstellationUnlock(node.id, 'cleric')
        expect(info.conditions.length).toBeGreaterThan(0)
    }
    for (const node of fullConstellationCatalog.filter((entry) => entry.acquisition === 'random')) {
        const info = describeConstellationUnlock(node.id, 'cleric')
        expect(info.conditions.join(' ')).toContain('Все условия обязательны')
        expect(info.conditions.join(' ')).toContain('открытие сохраняется')
    }
    const area = describeConstellationUnlock('prayer.area')
    expect(area.conditions.join(' ')).toContain('Проводник')
    expect(area.conditions.join(' ')).toContain('Дальний голос')
    expect(area.chanceBoosts.join(' ')).toContain('1 + min(5')
    expect(area.chanceBoosts.join(' ')).toContain('только после выполнения')
    expect(describeConstellationUnlock('missing')).toEqual({ conditions: [], chanceBoosts: [] })
})
it('shows real mastery gates and explicit spell learning prerequisites', () => {
    expect(describeConstellationUnlock('prayer.harm2').conditions.join(' ')).not.toMatch(
        /уровень не ниже [357]/
    )
    expect(describeConstellationUnlock('prayer.revive_master').conditions.join(' ')).toContain(
        'уровень не ниже 12'
    )
    expect(describeConstellationUnlock('prayer.revive_angelic').conditions.join(' ')).toContain(
        'уровень не ниже 12'
    )
    const fire = describeConstellationUnlock('magic.fire_damage').conditions.join(' ')
    expect(fire).toContain('уровень не ниже 3')
    expect(fire).toContain('Огненная стрела')
    expect(describeConstellationUnlock('magic.greater_fireball').conditions.join(' ')).toContain(
        'уровень не ниже 10'
    )
    expect(
        describeConstellationUnlock('prayer.revive', 'cleric').conditions.join(' ')
    ).not.toContain('уровень не ниже')
    expect(describeConstellationUnlock('prayer.revive', 'vanguard').conditions.join(' ')).toContain(
        'уровень не ниже 5'
    )
})
it('keeps immediate special conditions outside the random pool', () => {
    const last = describeConstellationUnlock('prayer.last_light')
    expect(last.conditions.join(' ')).toMatch(/20%.*вражеских ран/)
    expect(last.conditions.join(' ')).toContain('без случайного выбора')
    expect(last.chanceBoosts).toEqual([])
    const rune = describeConstellationUnlock('magic.runic_echo')
    expect(rune.conditions.join(' ')).toContain('по той же цели за 5 секунд')
    expect(rune.conditions.join(' ')).toContain('Тренировочные цели не засчитываются')
    const breath = describeConstellationUnlock('life.breath')
    expect(breath.conditions.join(' ')).toContain('Чувство усталости')
    expect(breath.conditions.join(' ')).toContain('тройного базового запаса энергии')
    expect(breath.conditions.join(' ')).toContain('не расходует открытие')
    expect(breath.chanceBoosts).toEqual([])
})
