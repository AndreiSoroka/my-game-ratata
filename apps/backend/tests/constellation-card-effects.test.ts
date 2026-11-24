import { describe, expect, it } from 'vitest'

import {
    resolveConstellationCardEffectRows,
    resolveConstellationCardEffects,
} from '../src/game/constellationCardEffects'
import { fullConstellationCatalog } from '../src/game/constellationNodes'
import { observedConstellationCardEffectRows } from '../src/game/constellationResultDisclosure'

const base = [
    'Лечит вас или союзника.',
    'Очищает могилы от тёмных сил.',
    'За одну молитву действует на одну выбранную цель.',
]
const revival =
    'Воскрешает павших товарищей, душа которых ещё не ушла в мир иной.'
const harm = 'Наносит урон нежити в радиусе молитвы.'
const all = new Set(fullConstellationCatalog.map((node) => node.id))

function requiredEffects(
    id: string,
    learned: ReadonlySet<string> = all
): string[] {
    const result = resolveConstellationCardEffects(id, learned)
    if (result === undefined) {
        throw new Error(`Missing effects: ${id}`)
    }
    return result
}

describe('earned effects of active constellation cards', () => {
    it('adds and removes resurrection and Kara with learned knowledge only', () => {
        const learned = new Set(['prayer.root'])
        expect(resolveConstellationCardEffects('prayer.root', learned)).toEqual(
            base
        )
        learned.add('prayer.revive')
        expect(resolveConstellationCardEffects('prayer.root', learned)).toEqual(
            [...base, revival]
        )
        learned.add('prayer.harm')
        expect(resolveConstellationCardEffects('prayer.root', learned)).toEqual(
            [...base, revival, harm]
        )
        learned.delete('prayer.harm')
        expect(resolveConstellationCardEffects('prayer.root', learned)).toEqual(
            [...base, revival]
        )
        learned.delete('prayer.revive')
        expect(resolveConstellationCardEffects('prayer.root', learned)).toEqual(
            base
        )
    })
    it('combines sequential bonuses and does not list inherited boosts twice', () => {
        const effects = requiredEffects('prayer.root')
        expect(effects).toEqual(
            expect.arrayContaining([
                'Лечит вас или союзника.',
                'Очищает могилы от тёмных сил.',
                revival,
                harm,
                'Лечение усилено на 395%.',
                'Урон кары увеличен на 360%.',
                'Радиус молитвы увеличен на 2 клетки.',
                'Молитва совершается на 60% быстрее.',
            ])
        )
        expect(
            effects.filter((line) => line.startsWith('Лечение усилено'))
        ).toHaveLength(1)
        expect(
            effects.filter((line) => line.startsWith('Урон кары увеличен'))
        ).toHaveLength(1)
        expect(new Set(effects).size).toBe(effects.length)
        expect(effects).toContain('Воскрешение возвращает не менее 100% HP.')
        expect(effects).toContain(
            'Шанс воскрешения повышен на 25 процентных пунктов, но не выше 95%.'
        )
        expect(effects).toContain(
            'После успешного воскрешения с вероятностью 30% возвращает по 150% здоровья, маны и энергии.'
        )
        expect(effects).not.toContain(
            'Одновременно совершает разные чудеса: не более 20 целей за молитву.'
        )
        expect(requiredEffects('prayer.area')).toContain(
            'Одновременно совершает разные чудеса: не более 20 целей за молитву.'
        )
    })
    it('isolates the four prayer schools and the undead resurrection mode', () => {
        expect(
            resolveConstellationCardEffects('prayer_lantern.root', all)
        ).toBeUndefined()
        expect(
            resolveConstellationCardEffects('prayer_grave.root', all)
        ).toContain(
            'Возвращает павших товарищей из числа нежити, чья душа ещё не покинула этот мир.'
        )
        const missingOwnRevival = new Set(all)
        missingOwnRevival.delete('prayer_grave.revive')
        expect(
            resolveConstellationCardEffects(
                'prayer_grave.root',
                missingOwnRevival
            )
        ).not.toContain(
            'Возвращает павших товарищей из числа нежити, чья душа ещё не покинула этот мир.'
        )
        expect(
            resolveConstellationCardEffects('prayer.root', missingOwnRevival)
        ).toContain(revival)
    })
})

it('includes only the applicable learned modifiers of both shots and both fireballs', () => {
    const shot = requiredEffects('arrow.root')
    expect(shot).toContain('Урон Быстрого выстрела увеличен на 25%.')
    expect(shot).toContain('Дальность Быстрого выстрела увеличена на 2 клетки.')
    expect(shot).toContain('Быстрый выстрел расходует на 3 EN меньше.')
    expect(shot).toContain(
        'После полезного попадания следующий Быстрый выстрел по той же цели в течение 3 секунд наносит на 15% больше урона.'
    )
    expect(shot).toContain(
        'После полезного боевого заклинания следующий Быстрый выстрел на 10% сильнее в течение 5 секунд.'
    )
    expect(shot.join(' ')).not.toMatch(
        /Лечение|могил|Барьер|Искры|огненных шаров/
    )
    expect(
        requiredEffects('arrow.root', new Set(['arrow.root', 'arrow.series1']))
    ).toContain(
        'После полезного попадания следующий Быстрый выстрел по той же цели в течение 3 секунд наносит на 10% больше урона.'
    )
    const sniper = requiredEffects('arrow.sniper_shot')
    expect(sniper).toContain(
        'Дальность Снайперского выстрела увеличена на 2 клетки.'
    )
    expect(sniper).toContain(
        'Прицеливание Снайперского выстрела короче на 150 мс.'
    )
    expect(sniper.join(' ')).not.toContain('Быстрого выстрела')
    expect(
        requiredEffects('arrow.sniper_shot', new Set(['arrow.sniper_shot']))
    ).toEqual([
        'Во время прицеливания стрелок стоит. Ходьба прерывает выстрел.',
    ])
    for (const id of ['magic.fireball', 'magic.greater_fireball']) {
        const effects = requiredEffects(id)
        expect(effects).toContain(
            'Урон Огненной стрелы и Большого огненного шара увеличен на 10%.'
        )
        expect(effects).toContain(
            'Полезное попадание создаёт рунический заряд, который усиливает следующий Быстрый выстрел на 10% в течение 5 секунд.'
        )
        expect(effects.join(' ')).not.toMatch(
            /Лечение|могил|Барьер|Искры|Дальность Быстрого выстрела/
        )
    }
    expect(
        fullConstellationCatalog.filter((node) => node.effectType === 'active')
    ).toHaveLength(25)
    for (const node of fullConstellationCatalog.filter(
        (entry) => entry.effectType === 'active'
    )) {
        expect(() =>
            resolveConstellationCardEffects(node.id, all)
        ).not.toThrow()
    }
})

it('includes the marching song and only learned Road Prayer improvements', () => {
    const baseRoadEffects = requiredEffects(
        'prayer_road.root',
        new Set(['prayer_road.root'])
    )
    expect(baseRoadEffects[0]).toContain('Походная песня')
    expect(baseRoadEffects).toHaveLength(2)
    expect(requiredEffects('prayer_road.root')).toEqual([
        ...baseRoadEffects,
        ...requiredEffects('prayer_road.walk'),
        ...requiredEffects('prayer_road.shoulder'),
        ...requiredEffects('prayer_road.bard'),
    ])
})

describe('passive card data and catalogue isolation', () => {
    it('keeps passive cards scoped to their own authored effects and preserves immutable catalogue data', () => {
        const before = JSON.stringify(fullConstellationCatalog)
        for (const node of fullConstellationCatalog.filter(
            (entry) => entry.effectType === 'passive'
        )) {
            expect(resolveConstellationCardEffects(node.id, all)).toEqual(
                [...(node.results ?? []), ...(node.effects ?? [])].length === 0
                    ? undefined
                    : [...(node.results ?? []), ...(node.effects ?? [])]
            )
        }
        expect(
            resolveConstellationCardEffects('missing.root', all)
        ).toBeUndefined()
        const result = requiredEffects('prayer.root')
        result[0] = 'Changed'
        result.push('Changed')
        expect(
            resolveConstellationCardEffects('prayer.root', all)
        ).not.toContain('Changed')
        expect(JSON.stringify(fullConstellationCatalog)).toBe(before)
        expect(all.size).toBe(fullConstellationCatalog.length)
    })
})

it('localizes every earned row and preserves the insight limit for both languages', () => {
    for (const node of fullConstellationCatalog) {
        const rows = resolveConstellationCardEffectRows(node.id, all) ?? []
        expect(rows.map(([russian]) => russian)).toEqual(
            resolveConstellationCardEffects(node.id, all) ?? []
        )
        for (const [, english] of rows) {
            expect(english, node.id).not.toMatch(/\p{Script=Cyrillic}/u)
        }
    }
    const learned = new Set(['blade.root', 'blade.insight1'])
    expect(observedConstellationCardEffectRows('blade.root', learned)).toEqual([
        ['Урон клинка увеличен на 10%.', 'Blade damage increases by 10%.'],
    ])
    expect(
        observedConstellationCardEffectRows('blade.damage2', learned)
    ).toBeUndefined()
})

it('formats exact combined ranks, time and fractional costs for both locales', () => {
    expect(
        resolveConstellationCardEffectRows('blade.wide_swing', all)?.[3]
    ).toEqual([
        'Сектор 150° с радиусом 1,1 обычной досягаемости; стены преграждают удар.',
        'A 150° arc with a radius of 1.1 times normal reach. Walls block the strike.',
    ])
    expect(
        resolveConstellationCardEffectRows('magic.chains', all)?.[1]
    ).toEqual([
        'Расходует 2,4 MP/с во время удержания.',
        'Costs 2.4 MP/s while held.',
    ])
})
