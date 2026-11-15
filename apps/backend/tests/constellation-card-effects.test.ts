import { describe, expect, it } from 'vitest'

import { resolveConstellationCardEffects } from '../src/game/constellationCardEffects'
import { fullConstellationCatalog } from '../src/game/constellationNodes'

const base = ['Лечит вас или союзника.', 'Очищает могилы от тёмных сил.']
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
                'Лечит вас и всех подходящих союзников в радиусе молитвы.',
                'Очищает могилы от тёмных сил.',
                revival,
                harm,
                'Лечение усилено на 10%.',
                'Урон кары увеличен на 60%.',
                'Радиус молитвы увеличен на 2 клетки.',
                'Молитва совершается на 10% быстрее.',
                'Одновременно лечит союзников и очищает могилы в радиусе молитвы.',
                'Пока ваше здоровье ниже 20% из-за вражеских ран, ваша молитва лечит на 10% сильнее.',
            ])
        )
        expect(
            effects.filter((line) => line.startsWith('Лечение усилено'))
        ).toHaveLength(1)
        expect(
            effects.filter((line) => line.startsWith('Урон кары увеличен'))
        ).toHaveLength(1)
        expect(new Set(effects).size).toBe(effects.length)
        expect(effects).not.toContain('Лечит вас или союзника.')
    })
    it('isolates the four prayer schools and the undead resurrection mode', () => {
        for (const id of ['prayer_road.root', 'prayer_lantern.root']) {
            expect(resolveConstellationCardEffects(id, all)).toBeUndefined()
        }
        expect(
            resolveConstellationCardEffects('prayer_grave.root', all)
        ).toEqual([
            'Возвращает павших товарищей из числа нежити, чья душа ещё не покинула этот мир.',
        ])
        const missingOwnRevival = new Set(all)
        missingOwnRevival.delete('prayer_grave.revive')
        expect(
            resolveConstellationCardEffects(
                'prayer_grave.root',
                missingOwnRevival
            )
        ).toBeUndefined()
        expect(
            resolveConstellationCardEffects('prayer.root', missingOwnRevival)
        ).toContain(revival)
    })
    it('includes only the applicable learned modifiers of Shot and both fireballs', () => {
        const shot = requiredEffects('arrow.root')
        expect(shot).toContain('Урон Выстрела увеличен на 20%.')
        expect(shot).toContain('Дальность Выстрела увеличена на 2 клетки.')
        expect(shot).toContain(
            'После полезного боевого заклинания следующий Выстрел на 10% сильнее в течение 5 секунд.'
        )
        expect(shot.join(' ')).not.toMatch(
            /Лечение|могил|Барьер|Искры|огненных шаров/
        )
        for (const id of ['magic.fireball', 'magic.greater_fireball']) {
            const effects = requiredEffects(id)
            expect(effects).toContain('Урон огненных шаров увеличен на 10%.')
            expect(effects).toContain(
                'Полезное попадание создаёт рунический заряд: следующий Выстрел на 10% сильнее в течение 5 секунд.'
            )
            expect(effects.join(' ')).not.toMatch(
                /Лечение|могил|Барьер|Искры|Дальность Выстрела/
            )
        }
        expect(
            fullConstellationCatalog.filter(
                (node) => node.effectType === 'active'
            )
        ).toHaveLength(7)
        for (const node of fullConstellationCatalog.filter(
            (entry) => entry.effectType === 'active'
        )) {
            expect(() =>
                resolveConstellationCardEffects(node.id, all)
            ).not.toThrow()
        }
    })
})

describe('passive card data and catalogue isolation', () => {
    it('keeps passive cards scoped to their own authored effects and preserves immutable catalogue data', () => {
        const before = JSON.stringify(fullConstellationCatalog)
        for (const node of fullConstellationCatalog.filter(
            (entry) => entry.effectType === 'passive'
        )) {
            expect(resolveConstellationCardEffects(node.id, all)).toEqual(
                node.effects
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
        expect(all.size).toBe(77)
    })
})
