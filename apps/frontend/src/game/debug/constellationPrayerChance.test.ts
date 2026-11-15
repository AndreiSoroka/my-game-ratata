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

describe('prayer effect probabilities in the debug atlas', () => {
    it('covers all 24 prayer nodes while leaving the other constellations to their own rules', () => {
        const catalogBefore = structuredClone(fullConstellationCatalog)
        const prayerNodes = fullConstellationCatalog.filter((node) =>
            node.constellationId.startsWith('prayer')
        )
        expect(prayerNodes).toHaveLength(24)
        for (const node of prayerNodes) {
            const description = describePrayerEffectChance(node)
            expect(description?.summary.length).toBeGreaterThan(0)
            expect(description?.formulas.length).toBeGreaterThan(0)
            expect(description?.examples.length).toBeGreaterThan(0)
        }
        const blade = fullConstellationCatalog.find((node) => node.id === 'blade.root')!
        expect(describePrayerEffectChance(blade)).toBeUndefined()
        expect(fullConstellationCatalog).toEqual(catalogBefore)
    })
    it.each([
        ['prayer', 'Угольная Мать', 'faith', 'miracles'],
        ['prayer_road', 'Безымянный Путник', 'road_faith', 'road_miracles'],
        ['prayer_lantern', 'Слепой Архивариус', 'lantern_faith', 'lantern_miracles'],
        ['prayer_grave', 'Хранитель Праха', 'grave_faith', 'grave_miracles'],
    ])('uses the own school Faith and deity for %s', (path, god, faith, miracles) => {
        const description = describeNode(`${path}.root`)
        expect(description.summary).toContain(god)
        expect(description.notes.join(' ')).toContain(`(${faith})`)
        expect(description.notes.join(' ')).toContain(`(${miracles})`)
        expect(description.formulas.join(' ')).toContain('1,5 п.п.')
        expect(description.examples).toHaveLength(6)
        for (const [index, example] of description.examples.entries()) {
            expect(example.label).toContain(index < 3 ? '1 ·' : '10 ·')
            expect(example.value).toContain(`Ответ ${answers[index]}`)
            expect(example.value).toContain(`отказ ${refusals[index]}`)
        }
    })
    it('distinguishes the neutral 55% answer from a 20% purification step and five accumulated successes', () => {
        const description = describeNode('prayer.root')
        const neutral = description.examples.find(
            (row) => row.label === 'Вера 1 · нейтральное настроение'
        )
        expect(neutral?.value).toBe('Ответ 55%; отказ 45%; шаг очищения 20%.')
        expect(description.formulas.join(' ')).toContain('20% × Pответа / 55%')
        expect(description.formulas.join(' ')).toContain('5 успешных шагов')
        for (const [index, row] of description.examples.entries())
            expect(row.value).toContain(`шаг очищения ${graveSteps[index]}`)
        expect(description.notes.join(' ')).toContain('не обязаны идти подряд')
        expect(description.notes.join(' ')).toContain('отказ сохраняет')
    })
    it.each(['prayer.revive', 'prayer_grave.revive'])(
        'keeps %s on the answer roll and standard half resources',
        (id) => {
            const description = describeNode(id)
            expect(description.formulas.join(' ')).toContain('Pвоскрешения = Pответа')
            expect(description.formulas.join(' ')).toContain('ceil(максимальное HP × 0,5)')
            expect(description.examples[1]?.value).toBe('Ответ 55%; отказ 45%.')
            expect(description.notes.join(' ')).toContain('не меняют шанс воскрешения')
        }
    )
})

describe('prayer passives retain their underlying probability', () => {
    it('uses the capped +20 percentage-point harm threshold and a single roll for all victims', () => {
        for (const id of ['prayer.harm', 'prayer.harm1', 'prayer.harm2']) {
            const description = describeNode(id)
            expect(description.formulas.join(' ')).toContain('Pкары = min(95%, Pответа + 20 п.п.)')
            expect(description.formulas.join(' ')).toContain('Чудеса − 3')
            for (const [index, row] of description.examples.entries())
                expect(row.value).toContain(`кара ${harms[index]}`)
            expect(description.notes.join(' ')).toContain('один r ∈ [0, 1)')
            expect(description.notes.join(' ')).toContain('Pответа ≤ r < Pкары')
            expect(description.notes.join(' ')).toContain('При Чудесах 1–3 её базовая сила равна 6')
        }
        expect(describeNode('prayer.harm1').formulas.join(' ')).toContain('множителя урона = 100%')
        expect(describeNode('prayer.harm').formulas.join(' ')).not.toContain(
            'множителя урона = 100%'
        )
    })
    it('keeps modifiers and insight deterministic without turning the prayer answer into 100%', () => {
        for (const id of [
            'prayer.radius1',
            'prayer.radius2',
            'prayer.focus',
            'prayer.gift1',
            'prayer.gift2',
        ]) {
            const description = describeNode(id)
            expect(description.formulas[0]).toContain('= 100%')
            expect(description.formulas.join(' ')).toContain('Pответа = min(95%')
            expect(description.notes.join(' ')).toContain(
                'Сам дар молитвы по-прежнему требует ответа'
            )
        }
        expect(describeNode('prayer.focus').examples[0]?.value).toContain('2700 мс')
        for (const prefix of ['omen', 'others'])
            for (let rank = 1; rank <= 4; rank++) {
                const description = describeNode(`prayer.${prefix}${rank}`)
                expect(description.formulas[0]).toContain('= 100%')
                expect(description.formulas[0]).toContain('дополнительного броска нет')
            }
    })
    it('applies Last Light before healing only after the actual hostile low-HP conditions', () => {
        const description = describeNode('prayer.last_light')
        expect(description.formulas[0]).toContain('= 100% при выполнении его условий')
        expect(description.formulas.join(' ')).toContain('HP < 20%')
        expect(description.formulas.join(' ')).toContain('вражеских ранах')
        expect(description.formulas.join(' ')).toContain('фиксируются до исцеления')
        expect(description.formulas.join(' ')).toContain('0,10 × I(Последний огонёк')
        expect(description.examples[1]?.value).toContain('при Вере 1 ответ всё ещё 55%')
        expect(description.notes.join(' ')).toContain(
            'Воскрешение сохраняет стандартную половину ресурсов'
        )
    })
    it('keeps area restoration and purification on their different thresholds of the same roll', () => {
        const description = describeNode('prayer.area')
        expect(description.formulas.join(' ')).toContain('r < Pответа')
        expect(description.formulas.join(' ')).toContain('r < Pшага')
        expect(description.notes.join(' ')).toContain('один r ∈ [0, 1)')
        expect(description.notes.join(' ')).toContain('одну выбранную цель')
        expect(description.notes.join(' ')).toContain('кара и без Общей молитвы')
    })
    it('returns independent arrays and examples, without real character or deity state', () => {
        const first = describeNode('prayer.root')
        const untouched = structuredClone(first)
        first.formulas.push('Changed formula')
        first.notes.splice(0)
        if (first.examples[0]) first.examples[0].label = 'Changed example'
        expect(describeNode('prayer.root')).toEqual(untouched)
        expect(JSON.stringify(untouched)).not.toMatch(/currentMood|practice|receipts|seed|actorId/)
    })
})
