import { bladeAbilityIds } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { fullConstellationCatalog } from '../../../../backend/src/game/constellationNodes'
import { enableAllConstellationStars } from './constellationBuild'
import { describeConstellationBuild } from './constellationBuildSummary'

const all = enableAllConstellationStars()
const nonPrayer = fullConstellationCatalog.filter(
    (node) => !node.constellationId.startsWith('prayer')
)
const values = (nodeId: string, active: ReadonlySet<string> = all, options = {}) =>
    Object.fromEntries(
        describeConstellationBuild(nodeId, active, options).rows.map((entry) => [
            entry.label,
            entry.value,
        ])
    )

describe('each passive owns only its authored effect', () => {
    it('covers every non-prayer passive, including roots, and stays independent of the rest of the build', () => {
        for (const node of nonPrayer.filter((entry) => entry.effectType === 'passive')) {
            const selected = describeConstellationBuild(node.id, new Set([node.id]))
            const full = describeConstellationBuild(node.id, all)
            const inactive = describeConstellationBuild(node.id, new Set())
            expect(selected.effectType).toBe('passive')
            expect(selected.rows.length + (selected.effects?.length ?? 0)).toBeGreaterThan(0)
            expect(full.rows).toEqual(selected.rows)
            expect(full.effects).toEqual(selected.effects)
            expect(inactive.rows).toEqual(selected.rows)
            expect(inactive.effects).toEqual(selected.effects)
            expect(selected.available).toBe(true)
            expect(inactive.available).toBe(false)
        }
    })
    it('shows one contribution for sequential upgrades rather than their accumulated value', () => {
        expect(values('blade.damage2')).toEqual({
            'Результат 1': 'Урон клинка увеличен ещё на 15%.',
        })
        expect(values('arrow.damage2')).toEqual({ 'Усиление урона Выстрела': '+10%' })
        expect(values('arrow.range2')).toEqual({ 'Добавка к дальности Выстрела': '+1 клетка' })
        expect(values('shadow.noise2')).toEqual({ 'Шум движения крадучись': '−15%' })
        expect(values('shadow.luck2')).toEqual({
            'Бонус получения предмета при незамеченности': '+3 п.п.',
        })
        expect(values('life.hp1')).toEqual({
            'Оценка текущего и максимального здоровья': 'шаг 25',
            'Оценка скорости': 'шаг 0,5 клетки/с',
            'Оценка уклонения': 'шаг 2 п.п.',
        })
        expect(values('life.hp3')['Оценка скорости']).toBe('шаг 0,125 клетки/с')
    })
    it('reports the joint runic contribution without rolling in Shot damage or example state', () => {
        const before = describeConstellationBuild('magic.runic_echo', all)
        const charged = describeConstellationBuild('magic.runic_echo', all, { runicCharged: true })
        expect(before.rows).toEqual([
            { label: 'Усиление следующего Выстрела', value: '+10%' },
            { label: 'Время на Выстрел', value: '5000 мс' },
        ])
        expect(charged).toEqual(before)
        expect(values('magic.root')).toEqual({ 'Дополнительный численный эффект': 'Нет' })
        expect(Object.values(values('blade.root'))).toContain('Урон клинка увеличен на 10%.')
        expect(Object.keys(values('blade.root'))).toHaveLength(5)
    })
})

describe('standalone actions own only their complete applicable build', () => {
    it('uses catalog action metadata for every active non-prayer node', () => {
        expect(
            nonPrayer
                .filter((node) => node.effectType === 'active')
                .map((node) => node.activationAbilityId)
        ).toEqual(['shot', ...bladeAbilityIds, 'fireball', 'greater_fireball'])
        for (const node of nonPrayer.filter((entry) => entry.effectType === 'active')) {
            const result = describeConstellationBuild(node.id, all)
            expect(result.effectType).toBe('active')
            expect(result.activationAbilityId).toBe(node.activationAbilityId)
            expect(result.rows.length).toBeGreaterThan(0)
            expect(describeConstellationBuild(node.id, new Set()).rows).toEqual([])
        }
    })
    it('totals Shot modifiers and cross-path charge without including unrelated actions', () => {
        expect(values('arrow.root', all, { tileWidth: 16 })).toMatchObject({
            'Урон Выстрела от звёзд Стрелы': '×1,2',
            'Итоговый множитель урона Выстрела': '×1,2',
            'Дальность Выстрела': '6 клеток',
            'Цена Выстрела, EN': '9',
            'Кулдаун Выстрела, мс': '495',
            'Бонус критического шанса Выстрела': '+3 п.п.',
        })
        expect(
            values('arrow.root', all, { runicCharged: true })['Итоговый множитель урона Выстрела']
        ).toBe('×1,32')
        const noEcho = new Set(all)
        noEcho.delete('magic.runic_echo')
        expect(
            values('arrow.root', noEcho, { runicCharged: true })[
                'Итоговый множитель урона Выстрела'
            ]
        ).toBe('×1,2')
        expect(JSON.stringify(describeConstellationBuild('arrow.root', all))).not.toMatch(
            /Искр|Барьер|огненн/i
        )
    })
    it('calculates each fireball independently with its own base power and the learned heat modifier', () => {
        expect(values('magic.fireball', all, { tileWidth: 16 })).toEqual({
            'Урон Огненного шара': '9 HP',
            'Множитель урона Огненного шара': '×1,1',
            'Дальность Огненного шара': '10 клеток',
            'Цена заклинания, MP': '12',
            'Подготовка заклинания, мс': '400',
            'Кулдаун заклинания, мс': '1000',
        })
        expect(values('magic.greater_fireball')['Урон Большого огненного шара']).toBe('20 HP')
        expect(
            values('magic.fireball', new Set(['magic.root', 'magic.fireball']))[
                'Урон Огненного шара'
            ]
        ).toBe('8 HP')
        expect(describeConstellationBuild('magic.fireball', all).effects?.join(' ')).toContain(
            'следующий Выстрел на 10%'
        )
        expect(values('magic.fireball')['Итоговый множитель урона Выстрела']).toBeUndefined()
    })
    it('does not mutate inputs, share output rows or handle prayer nodes as unrelated action totals', () => {
        const ids = [...all]
        const catalog = JSON.stringify(fullConstellationCatalog)
        const result = describeConstellationBuild('life.hp1', all)
        result.rows[0]!.value = 'changed'
        result.effects?.push('changed')
        expect(JSON.stringify(describeConstellationBuild('life.hp1', all))).not.toContain('changed')
        expect([...all]).toEqual(ids)
        expect(JSON.stringify(fullConstellationCatalog)).toBe(catalog)
        expect(describeConstellationBuild('prayer.root', all)).toEqual({ rows: [] })
        expect(describeConstellationBuild('missing.root', all)).toEqual({ rows: [] })
    })
})
