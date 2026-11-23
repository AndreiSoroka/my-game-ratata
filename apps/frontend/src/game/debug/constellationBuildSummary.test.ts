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
        expect(values('arrow.damage2')).toEqual({ 'Усиление урона Быстрого выстрела': '+10%' })
        expect(values('arrow.range2')).toEqual({
            'Добавка к дальности Быстрого выстрела': '+1 клетка',
        })
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
            { label: 'Усиление следующего Быстрого выстрела', value: '+10%' },
            { label: 'Время на Быстрый выстрел', value: '5000 мс' },
        ])
        expect(charged).toEqual(before)
        expect(values('magic.root')).toEqual({ 'Дополнительный численный эффект': 'Нет' })
        expect(Object.values(values('blade.root'))).toContain('Урон клинка увеличен на 10%.')
        expect(Object.keys(values('blade.root'))).toHaveLength(5)
    })
    it('shows effective food and dash values and the separate energy recovery bonuses', () => {
        expect(values('life.ration')).toEqual({ 'Лечение дорожной едой': 'до 25 HP' })
        expect(values('life.long_dash')).toEqual({ 'Длительность рывка': '1300 мс' })
        expect(values('life.breath')).toEqual({
            'Восстановление энергии при ходьбе': '+20%',
            'Восстановление энергии на месте': '+50%',
        })
        expect(values('life.rest')).toEqual({
            'Дополнительное восстановление энергии на месте': '+30%',
        })
    })
    it('reports the authored effect of each Undead star', () => {
        const undead = nonPrayer.filter((node) => node.constellationId === 'undead')
        expect(undead).toHaveLength(39)
        for (const node of undead) {
            expect(describeConstellationBuild(node.id, all).effects).toEqual([node.description])
        }
    })
})

describe('standalone actions own only their complete applicable build', () => {
    it('uses catalog action metadata for every active non-prayer node', () => {
        expect(
            nonPrayer
                .filter((node) => node.effectType === 'active')
                .map((node) => node.activationAbilityId)
        ).toEqual([
            'shot',
            ...bladeAbilityIds,
            'chains',
            'blink',
            'dispel_magic',
            'city_portal',
            'fireball',
            'greater_fireball',
            'sniper_shot',
        ])
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
            'Урон Быстрого выстрела от звёзд Стрелы': '×1,25',
            'Итоговый множитель урона Быстрого выстрела': '×1,25',
            'Дальность Быстрого выстрела': '6 клеток',
            'Цена Быстрого выстрела, EN': '7',
            'Прицеливание, мс': '200',
            'Кулдаун Быстрого выстрела, мс': '468',
            'Бонус критического шанса Быстрого выстрела': '+5 п.п.',
            'Урон в серии Быстрых выстрелов': '+15%',
            'Окно серии Быстрых выстрелов, мс': '3000',
        })
        expect(
            values('arrow.root', all, { runicCharged: true })[
                'Итоговый множитель урона Быстрого выстрела'
            ]
        ).toBe('×1,375')
        const noEcho = new Set(all)
        noEcho.delete('magic.runic_echo')
        expect(
            values('arrow.root', noEcho, { runicCharged: true })[
                'Итоговый множитель урона Быстрого выстрела'
            ]
        ).toBe('×1,25')
        expect(JSON.stringify(describeConstellationBuild('arrow.root', all))).not.toMatch(
            /Искр|Барьер|огненн/i
        )
    })
    it('calculates each fireball independently with its own base power and the learned heat modifier', () => {
        expect(values('magic.fireball', all, { tileWidth: 16 })).toEqual({
            'Урон Огненной стрелы': '11–44 HP',
            'Множитель урона Огненной стрелы': '×1,1',
            'Дальность Огненной стрелы': '10 клеток',
            'Радиус взрыва, кл.': '4',
            'Цена заклинания, MP': '6',
            'Подготовка заклинания, мс': '400',
            'Кулдаун заклинания, мс': '5000',
        })
        expect(values('magic.greater_fireball')['Урон Большого огненного шара']).toBe('55–132 HP')
        expect(
            values('magic.fireball', new Set(['magic.root', 'magic.fireball']))[
                'Урон Огненной стрелы'
            ]
        ).toBe('10–40 HP')
        expect(describeConstellationBuild('magic.fireball', all).effects?.join(' ')).toContain(
            'следующий Быстрый выстрел на 10%'
        )
        expect(
            values('magic.fireball')['Итоговый множитель урона Быстрого выстрела']
        ).toBeUndefined()
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
