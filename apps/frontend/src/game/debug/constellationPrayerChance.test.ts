import { describe, expect, it } from 'vitest'

import { fullConstellationCatalog } from '../../../../backend/src/game/constellationNodes'
import { describePrayerEffectChance } from './constellationPrayerChance'

function describeNode(id: string) {
    const node = fullConstellationCatalog.find((entry) => entry.id === id)
    if (node === undefined) throw new Error(`Missing authored node: ${id}`)
    const result = describePrayerEffectChance(node)
    if (result === undefined) throw new Error(`Missing prayer description: ${id}`)
    return result
}
const answers = ['80%', '55%', '25%', '93,5%', '68,5%', '38,5%']
const refusals = ['20%', '45%', '75%', '6,5%', '31,5%', '61,5%']
const graveSteps = ['29,09%', '20%', '9,09%', '34%', '24,91%', '14%']
const harms = ['95%', '75%', '45%', '95%', '88,5%', '58,5%']

describe('short prayer formulas with complete readable legends', () => {
    it('covers all 24 prayer nodes, deriving legacy formulas from math-only expressions', () => {
        const before = structuredClone(fullConstellationCatalog)
        const nodes = fullConstellationCatalog.filter((node) =>
            node.constellationId.startsWith('prayer')
        )
        expect(nodes).toHaveLength(24)
        for (const node of nodes) {
            const description = describeNode(node.id)
            expect(description.summary.length).toBeGreaterThan(0)
            expect(description.examples.length).toBeGreaterThan(0)
            expect(description.formulaDetails?.length).toBeGreaterThan(0)
            expect(description.formulas).toEqual(
                description.formulaDetails?.map((detail) => detail.expression)
            )
            for (const detail of description.formulaDetails ?? []) {
                expect(detail.label.trim().length).toBeGreaterThan(0)
                expect(detail.expression).not.toMatch(/[А-Яа-яЁё]/)
                expect(detail.expression).not.toMatch(
                    /Pответа|Bнастроения|Qнастроения|Mлечения|I\(/
                )
                const symbols = detail.expression.match(/[A-Za-z]+/g) ?? []
                for (const symbol of symbols.filter(
                    (value) => !['min', 'max', 'round', 'ceil', 'mod'].includes(value)
                )) {
                    expect(
                        detail.variables.some(
                            (variable) =>
                                variable.symbol === symbol && variable.description.trim().length > 0
                        )
                    ).toBe(true)
                }
            }
        }
        const blade = fullConstellationCatalog.find((node) => node.id === 'blade.root')!
        expect(describePrayerEffectChance(blade)).toBeUndefined()
        expect(fullConstellationCatalog).toEqual(before)
    })
    it.each([
        ['prayer', 'Угольная Мать', 'faith', 'miracles'],
        ['prayer_road', 'Безымянный Путник', 'road_faith', 'road_miracles'],
        ['prayer_lantern', 'Слепой Архивариус', 'lantern_faith', 'lantern_miracles'],
        ['prayer_grave', 'Хранитель Праха', 'grave_faith', 'grave_miracles'],
    ])('uses the own-school Faith, power skill and deity for %s', (path, god, faith, miracles) => {
        const description = describeNode(`${path}.root`)
        expect(description.summary).toContain(god)
        const response = description.formulaDetails?.find(
            (detail) => detail.label === 'Шанс ответа, %'
        )
        expect(response?.expression).toBe('min(95, B + (C − 1) × 1,5)')
        expect(
            response?.variables.find((variable) => variable.symbol === 'B')?.description
        ).toMatch(/80.*55.*25/)
        expect(
            response?.variables.find((variable) => variable.symbol === 'C')?.description
        ).toContain(`(${faith})`)
        expect(
            description.formulaDetails
                ?.flatMap((detail) => detail.variables)
                .some(
                    (variable) =>
                        variable.symbol === 'L' && variable.description.includes(`(${miracles})`)
                )
        ).toBe(true)
        expect(description.examples).toHaveLength(6)
        for (const [index, example] of description.examples.entries()) {
            expect(example.label).toContain(index < 3 ? '1 ·' : '10 ·')
            expect(example.value).toContain(`Ответ ${answers[index]}`)
            expect(example.value).toContain(`отказ ${refusals[index]}`)
        }
    })
    it('preserves exact step chances and five accumulated successful prayers', () => {
        const description = describeNode('prayer.root')
        expect(description.examples[1]?.value).toBe('Ответ 55%; отказ 45%; шаг очищения 20%.')
        expect(description.formulas).toContain('min(95, 20 × P / 55)')
        expect(
            description.formulaDetails?.find(
                (detail) => detail.label === 'Успешных шагов до очищения'
            )?.expression
        ).toBe('5')
        for (const [index, row] of description.examples.entries())
            expect(row.value).toContain(`шаг очищения ${graveSteps[index]}`)
        expect(description.notes.join(' ')).toContain('не обязаны идти подряд')
        expect(description.notes.join(' ')).toContain('отказ сохраняет')
    })
    it.each(['prayer.revive', 'prayer_grave.revive'])(
        'keeps %s on the answer roll with fixed half resources',
        (id) => {
            const description = describeNode(id)
            expect(
                description.formulaDetails?.find((detail) => detail.label === 'Шанс воскрешения, %')
                    ?.expression
            ).toBe('P')
            expect(description.formulas).toContain('max(1, ceil(N × 0,5))')
            expect(description.formulas).toContain('0,5 × N')
            expect(description.examples[1]?.value).toBe('Ответ 55%; отказ 45%.')
            expect(description.notes.join(' ')).toContain('не меняют шанс воскрешения')
        }
    )
})

describe('prayer modifiers retain their real chance and conditions', () => {
    it('keeps the capped harm threshold, power breakpoint and common roll', () => {
        for (const id of ['prayer.harm', 'prayer.harm1', 'prayer.harm2']) {
            const description = describeNode(id)
            expect(description.formulas).toContain('min(95, P + 20)')
            expect(description.formulas).toContain('round((6 + 2 × max(0, L − 3)) × Q × M)')
            for (const [index, row] of description.examples.entries())
                expect(row.value).toContain(`кара ${harms[index]}`)
            expect(description.notes.join(' ')).toContain('один случайный бросок')
            expect(description.notes.join(' ')).toContain('её порог выше порога ответа')
            expect(description.notes.join(' ')).toContain('При Чудесах 1–3 её базовая сила равна 6')
        }
        expect(describeNode('prayer.harm1').formulas).toContain('100')
        expect(describeNode('prayer.harm').formulas).not.toContain('100')
    })
    it('keeps radius, focus and learned modifiers deterministic while prayer can still refuse', () => {
        for (const id of [
            'prayer.radius1',
            'prayer.radius2',
            'prayer.focus',
            'prayer.gift1',
            'prayer.gift2',
        ]) {
            const description = describeNode(id)
            expect(description.formulas[0]).toBe('100')
            expect(description.formulas).toContain('min(95, B + (C − 1) × 1,5)')
            expect(description.notes.join(' ')).toContain(
                'Сам дар молитвы по-прежнему требует ответа'
            )
        }
        expect(describeNode('prayer.radius1').formulas).toContain('48 + W × (A + D)')
        expect(describeNode('prayer.focus').formulas).toContain('round(3000 × (1 − 0,10 × A))')
        expect(describeNode('prayer.focus').examples[0]?.value).toContain('2700 мс')
        for (const prefix of ['omen', 'others'])
            for (let rank = 1; rank <= 4; rank++) {
                expect(describeNode(`prayer.${prefix}${rank}`).formulas[0]).toBe('100')
            }
        expect(
            describeNode('prayer.others3')
                .formulaDetails?.find((detail) => detail.label === 'Шанс ответа, %')
                ?.variables.find((variable) => variable.symbol === 'C')?.description
        ).toContain('школы отвечающего бога')
    })
    it('explains conditional Last Light using a short expression and full binary legend', () => {
        const description = describeNode('prayer.last_light')
        expect(description.formulas[0]).toBe('100')
        expect(description.formulas).toContain('H < 0,20 × N')
        expect(description.formulas).toContain('1 + 0,05 × A + 0,05 × D + 0,10 × E')
        const condition = description.formulaDetails
            ?.flatMap((detail) => detail.variables)
            .find((variable) => variable.symbol === 'E')?.description
        expect(condition).toContain('изучен «Последний огонёк»')
        expect(condition).toContain('вражеского удара')
        expect(condition).toContain('иначе 0')
        expect(description.notes.join(' ')).toContain('до исцеления')
        expect(description.examples[1]?.value).toContain('при Вере 1 ответ всё ещё 55%')
    })
    it('keeps area gifts and grave steps on distinct thresholds of the same roll', () => {
        const description = describeNode('prayer.area')
        expect(description.formulas).toContain('r < P / 100')
        expect(description.formulas).toContain('r < G / 100')
        expect(description.notes.join(' ')).toContain('один случайный бросок')
        expect(description.notes.join(' ')).toContain('одну выбранную цель')
        expect(description.notes.join(' ')).toContain('кара и без Общей молитвы')
    })
    it('returns independent arrays, formula legends and examples', () => {
        const first = describeNode('prayer.root')
        const untouched = structuredClone(first)
        first.formulas.push('Changed')
        first.notes.splice(0)
        if (first.examples[0]) first.examples[0].label = 'Changed example'
        if (first.formulaDetails?.[0]?.variables[0])
            first.formulaDetails[0].variables[0].description = 'Changed legend'
        expect(describeNode('prayer.root')).toEqual(untouched)
        expect(JSON.stringify(untouched)).not.toMatch(/currentMood|practice|receipts|seed|actorId/)
    })
})
