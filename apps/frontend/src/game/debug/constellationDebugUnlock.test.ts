import { describe, expect, it } from 'vitest'

import { fullConstellationCatalog } from '../../../../backend/src/game/constellationNodes'
import { buildConstellationDebugSnapshot } from './constellationDebugData'
import { describeConstellationUnlock } from './constellationDebugUnlock'

describe('debug-only constellation unlock explanations', () => {
    it('covers all 77 nodes without changing normal card metadata', () => {
        for (const node of fullConstellationCatalog) {
            expect(describeConstellationUnlock(node.id).conditions.length).toBeGreaterThan(0)
        }
        const snapshot = buildConstellationDebugSnapshot({
            heroClass: 'cleric',
            seed: 'unlock-copy',
        })
        for (const node of snapshot.nodes) {
            expect(node).not.toHaveProperty('conditions')
            expect(node).not.toHaveProperty('chanceBoosts')
        }
        expect(describeConstellationUnlock('unknown.root')).toEqual({
            conditions: [],
            chanceBoosts: [],
        })
    })

    it('separates mandatory parents, banked progress and ability requirements from optional evidence', () => {
        const area = describeConstellationUnlock('prayer.area')
        expect(area.conditions.join(' ')).toContain('все предшественники')
        expect(area.conditions.join(' ')).toContain('prayer.gift1')
        expect(area.conditions.join(' ')).toContain('prayer.radius1')
        expect(area.conditions.join(' ')).toContain('1 непотраченная единица')
        expect(area.chanceBoosts.join(' ')).toContain('полезные дары')
        expect(area.chanceBoosts.join(' ')).toContain('очищения могил')
        expect(area.chanceBoosts.join(' ')).toContain('не обязательны')
        expect(area.chanceBoosts.join(' ')).toContain('1 + min(5')
        expect(area.chanceBoosts.join(' ')).toContain('от 1 до 6')
        expect(area.conditions.join(' ')).not.toContain('очищения могил')
        const heat = describeConstellationUnlock('magic.fire_damage')
        expect(heat.conditions.join(' ')).toContain('Изучена способность «Огненный шар» (fireball)')
        expect(describeConstellationUnlock('blade.economy').chanceBoosts).toEqual([])
        expect(describeConstellationUnlock('prayer.harm').conditions.join(' ')).not.toContain(
            'miracles'
        )
    })

    it('describes the exact automatic roots and teaching paths', () => {
        expect(describeConstellationUnlock('magic.root').conditions.join(' ')).toMatch(
            /Маг \(arcanist\) ИЛИ.*Искра.*Барьер/
        )
        expect(describeConstellationUnlock('magic.root').conditions.join(' ')).not.toContain(
            'Огненный шар'
        )
        expect(describeConstellationUnlock('prayer.root').conditions.join(' ')).toContain(
            'Клерик ИЛИ'
        )
        for (const [path, ability] of [
            ['prayer_road', 'pray_road'],
            ['prayer_lantern', 'pray_lantern'],
            ['prayer_grave', 'pray_grave'],
        ]) {
            const text = describeConstellationUnlock(`${path}.root`).conditions.join(' ')
            expect(text).toContain(ability)
            expect(text).toContain('учитель должен знать именно')
            expect(text).toContain('64 пикселей')
            expect(text).toContain('прямая видимость')
            expect(text).not.toContain('Клерик')
        }
        expect(describeConstellationUnlock('arrow.root').conditions.join(' ')).toContain('veteran')
        expect(describeConstellationUnlock('blade.root').conditions.join(' ')).toContain(
            'swordsmanship'
        )
        expect(describeConstellationUnlock('life.root').conditions.join(' ')).toContain(
            'враждебный урон здоровью'
        )
        expect(describeConstellationUnlock('shadow.root').conditions.join(' ')).toMatch(
            /stealth.*theft/
        )
    })
})

describe('debug special ability and joint unlocks', () => {
    it('does not require a successful miracle for ordinary prayer discoveries', () => {
        const rule = describeConstellationUnlock('prayer.radius1')
        expect(rule.conditions.join(' ')).toContain('божество не ответило')
        expect(rule.conditions.join(' ')).toContain('осмысленное действие')
        expect(describeConstellationUnlock('prayer.revive').conditions.join(' ')).not.toContain(
            'божество не ответило'
        )
    })

    it('states both Fireball learning routes and the automatic greater spell without inventing chapter requirements', () => {
        const fireball = describeConstellationUnlock('magic.fireball')
        expect(fireball.conditions.join(' ')).toMatch(/arcana.*не ниже 3/)
        expect(fireball.conditions.join(' ')).toContain('scholar')
        expect(fireball.conditions.join(' ')).toContain('уже знающий Огненный шар')
        expect(fireball.conditions.join(' ')).toContain('64 пикселей')
        expect(fireball.conditions.join(' ')).toContain('одной фракции')
        expect(fireball.conditions.join(' ')).toContain('прямая видимость')
        expect(fireball.conditions.join(' ')).not.toMatch(/глав|кредит/)
        expect(fireball.chanceBoosts).toEqual([])
        const greater = describeConstellationUnlock('magic.greater_fireball')
        expect(greater.conditions.join(' ')).toMatch(/fireball.*10 уровня/)
        expect(greater.conditions.join(' ')).toContain('автоматически')
        expect(greater.chanceBoosts).toEqual([])
    })

    it('uses the learned matching prayer and its own Miracles gate for resurrection', () => {
        for (const [node, ability, miracles] of [
            ['prayer.revive', 'pray', 'miracles'],
            ['prayer_grave.revive', 'pray_grave', 'grave_miracles'],
        ]) {
            const rule = describeConstellationUnlock(node!)
            expect(rule.conditions[0]).toContain(`(${ability})`)
            expect(rule.conditions[1]).toContain('Клерик ИЛИ')
            expect(rule.conditions[1]).toContain(`(${miracles}) не ниже 5`)
            expect(rule.chanceBoosts).toEqual([])
        }
    })

    it('requires Last Light parents, pre-heal hostile low HP and a useful gift to any eligible recipient', () => {
        const rule = describeConstellationUnlock('prayer.last_light')
        const text = rule.conditions.join(' ')
        expect(text).toContain('prayer.gift1')
        expect(text).toContain('life.hp1')
        expect(text).toContain('До исцеления')
        expect(text).toContain('строго меньше 20%')
        expect(text).toContain('порог пересечён из-за вражеского урона')
        expect(text).toContain('остались учтённые вражеские раны')
        expect(text).toContain('себе или подходящему союзнику')
        expect(text).toContain('успешно воскресила союзника')
        expect(text).toContain('без случайного выбора')
        expect(rule.chanceBoosts).toEqual([])
    })

    it('requires the latest useful spell then Shot against the same enemy within the inclusive five-second boundary', () => {
        const rule = describeConstellationUnlock('magic.runic_echo')
        const text = rule.conditions.join(' ')
        expect(text).toContain('magic.spark_damage')
        expect(text).toContain('arrow.damage1')
        expect(text).toContain('последнего полезного попадания')
        expect(text).toMatch(
            /Искрой.*огненных шаров.*Выстрелом.*той же цели.*5000 мс.*включительно/
        )
        expect(text).toContain('реальный враждебный урон')
        expect(text).toContain('тренировочной мишени не засчитываются')
        expect(rule.chanceBoosts).toEqual([])
    })

    it('returns independent mutable arrays without changing authored definitions or future descriptions', () => {
        const originalCatalog = structuredClone(fullConstellationCatalog)
        for (const id of ['prayer.area', 'prayer.revive', 'prayer.root']) {
            const first = describeConstellationUnlock(id)
            const second = describeConstellationUnlock(id)
            const untouched = structuredClone(second)
            first.conditions.push('Changed condition')
            first.chanceBoosts.push('Changed boost')
            expect(second).toEqual(untouched)
            expect(describeConstellationUnlock(id)).toEqual(untouched)
        }
        expect(fullConstellationCatalog).toEqual(originalCatalog)
    })
})
