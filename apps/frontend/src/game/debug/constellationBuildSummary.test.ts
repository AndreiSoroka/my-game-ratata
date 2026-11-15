import { afterEach, describe, expect, it, vi } from 'vitest'

import { fullConstellationCatalog } from '../../../../backend/src/game/constellationNodes'
import {
    disableConstellationStar,
    enableAllConstellationStars,
    initialConstellationBuild,
} from './constellationBuild'
import { describeConstellationBuild } from './constellationBuildSummary'

afterEach(() => vi.restoreAllMocks())

function values(
    path: Parameters<typeof describeConstellationBuild>[0],
    active: ReadonlySet<string>,
    options = {}
) {
    return Object.fromEntries(
        describeConstellationBuild(path, active, options).rows.map((entry) => [
            entry.label,
            entry.value,
        ])
    )
}

describe('selected non-prayer constellation totals', () => {
    it('totals sword modifiers and exact attack knowledge with their equipment conditions', () => {
        const all = enableAllConstellationStars()
        expect(values('blade', all)).toMatchObject({
            'Урон обычного удара исправным мечом': '×1,2',
            'Цена обычного удара исправным мечом': '×0,9',
            'Интервал, подготовка и блокировка удара мечом': '×0,9',
            'Бонус крита обычного удара исправным мечом': '+3 п.п.',
            'Бонус уклонения с исправным мечом': '+3 п.п.',
            'Длительность нового оглушения': '×0,85',
            'Знание обычного удара': 'точные урон, интервал и крит',
        })
        expect(describeConstellationBuild('blade', all).effects?.join(' ')).toContain('95%')
        const initial = values('blade', initialConstellationBuild('vanguard'))
        expect(initial['Урон обычного удара исправным мечом']).toBe('×1')
        expect(initial['Знание обычного удара']).toContain('шаг 5')
    })

    it('adds range in authored units and combines Shot damage with a selected runic charge', () => {
        const all = enableAllConstellationStars()
        expect(values('arrow', all, { tileWidth: 24 })).toMatchObject({
            'Урон Выстрела от звёзд Стрелы': '×1,2',
            'Итоговый множитель урона Выстрела': '×1,2',
            'Дальность Выстрела': '112 px',
            'Цена Выстрела, EN': '9',
            'Кулдаун Выстрела, мс': '495',
            'Бонус критического шанса Выстрела': '+3 п.п.',
        })
        expect(
            values('arrow', all, { runicCharged: true })['Итоговый множитель урона Выстрела']
        ).toBe('×1,32')
        expect(
            values('magic', all, { runicCharged: true })['Урон Выстрела с учётом всей сборки']
        ).toBe('×1,32')
        const noEcho = disableConstellationStar(all, 'magic.runic_echo').enabledIds
        expect(
            values('arrow', noEcho, { runicCharged: true })['Итоговый множитель урона Выстрела']
        ).toBe('×1,2')
        expect(values('arrow', all)['Дальность Выстрела']).toBe('64 px + 2 кл.')
        expect(values('arrow', all, { tileWidth: Number.NaN })['Дальность Выстрела']).toBe(
            '64 px + 2 кл.'
        )
        expect(values('arrow', all, { tileWidth: 0 })['Дальность Выстрела']).toBe('64 px + 2 кл.')
    })

    it('totals Spark, Barrier, fire damage and knowledge without inventing skill levels', () => {
        const all = enableAllConstellationStars()
        expect(values('magic', all, { tileWidth: 24 })).toMatchObject({
            'Урон Искры': '×1,1',
            'Дальность Искры': '104 px',
            'Цена Искры, MP': '5',
            'Цена Искры, EN': '5',
            'Запас поглощения Барьера': '10',
            'Длительность Барьера, мс': '6000',
            'Огненный шар': 'выбран',
            'Большой огненный шар': 'выбран',
            'Урон огненных шаров': '×1,1',
            'Знание маны': 'точно',
            'Знание изученных заклинаний': 'точные урон, интервал и крит',
        })
        const base = values('magic', initialConstellationBuild('arcanist'))
        expect(base).toMatchObject({
            'Урон Искры': '×1',
            'Цена Искры, MP': '6',
            'Запас поглощения Барьера': '8',
            'Длительность Барьера, мс': '5000',
            'Знание маны': 'шаг 50',
            'Огненный шар': 'не выбран',
        })
        expect(describeConstellationBuild('magic', all).effects?.join(' ')).toContain(
            'Уровни навыков не заданы'
        )
    })
})

describe('body and stealth totals and summary isolation', () => {
    it('combines life and stealth movement and keeps knowledge separate from actual recovery', () => {
        const all = enableAllConstellationStars()
        const body = values('life', all)
        expect(body).toMatchObject({
            'Скорость ходьбы относительно базовой': '×1,05',
            'Скорость крадучись с учётом Тени': '×0,51975',
            'Скорость рывка относительно базовой': '×1,68',
            'Цена рывка, EN': '27',
            'Знание текущего и максимального здоровья': 'точно',
            'Знание скорости': 'точно',
            'Знание уклонения': 'точно',
            'Знание текущей и максимальной энергии': 'точно',
        })
        const hp3 = disableConstellationStar(all, 'life.hp4').enabledIds
        expect(values('life', hp3)).toMatchObject({
            'Знание текущего и максимального здоровья': 'шаг 5',
            'Знание скорости': 'шаг 0,125 клетки/с',
            'Знание уклонения': 'шаг 0,5 п.п.',
        })
        expect(describeConstellationBuild('life', all).effects?.join(' ')).toContain(
            'не прибавляет здоровье'
        )
    })

    it('keeps theft detection, conditional success and total probability as a labelled example', () => {
        const all = enableAllConstellationStars()
        expect(values('shadow', all)).toMatchObject({
            'Скорость крадучись с учётом Жизни': '×0,51975',
            'Множитель радиуса шума от звёзд тишины': '×0,7',
            'Радиус шума: трава, пиксели': '8,064',
            'Множитель радиуса обнаружения от звезды Тени': '×0,9',
            'Цена попытки кражи, EN': '9',
            'Общий кулдаун кражи, мс': '7000',
            'Повторная кража у той же цели, мс': '60000',
            'Добавка к успеху кражи при незамеченности': '+6 п.п.',
            'Сзади: обнаружение': '60%',
            'Сзади: получение при незамеченности': '46,5%',
            'Сзади: незаметная кража': '18,6%',
        })
        expect(values('shadow', new Set())['Сзади: незаметная кража']).toBe('16,2%')
    })

    it('does not mutate inputs, static definitions or share returned rows, and delegates prayer summaries', () => {
        const all = enableAllConstellationStars()
        const before = [...all]
        const catalog = JSON.stringify(fullConstellationCatalog)
        vi.spyOn(Math, 'random').mockImplementation(() => {
            throw new Error('Not gameplay RNG')
        })
        const summary = describeConstellationBuild('arrow', all, { runicCharged: true })
        summary.rows[0] = { label: 'changed', value: 'changed' }
        summary.effects?.push('changed')
        expect(JSON.stringify(describeConstellationBuild('arrow', all))).not.toContain('changed')
        expect([...all]).toEqual(before)
        expect(JSON.stringify(fullConstellationCatalog)).toBe(catalog)
        for (const path of ['prayer', 'prayer_road', 'prayer_lantern', 'prayer_grave'] as const) {
            expect(describeConstellationBuild(path, all)).toEqual({ rows: [] })
        }
    })
})
