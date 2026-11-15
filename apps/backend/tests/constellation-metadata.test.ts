import { describe, expect, it } from 'vitest'

import {
    constellationWireId,
    fullConstellationCatalog,
} from '../src/game/constellationNodes'
import { syncAbilityConstellations } from '../src/game/constellations'
import { snapshotConstellations } from '../src/game/constellationSnapshot'
import { prepareConstellationLayout } from '../src/game/personalConstellationSky'
import { abilityHero as unpreparedHero } from './abilityTestHelpers'

function abilityHero(...args: Parameters<typeof unpreparedHero>) {
    const actor = unpreparedHero(...args)
    prepareConstellationLayout(actor)
    return actor
}

function requiredCard(actor: ReturnType<typeof abilityHero>, id: string) {
    const card = snapshotConstellations(actor).nodes.find(
        (node) => node.id === constellationWireId(id)
    )
    if (card === undefined) {
        throw new Error(`Missing card: ${id}`)
    }
    return card
}

describe('effect-only known card copy', () => {
    it('keeps acquisition instructions out of five general roots and both fireball cards', () => {
        const actor = abilityHero('vanguard')
        const ids = [
            'blade.root',
            'magic.root',
            'arrow.root',
            'life.root',
            'shadow.root',
            'magic.fireball',
            'magic.greater_fireball',
        ]
        for (const id of ids) {
            actor.progression.constellations.opened.add(id)
        }
        actor.abilities.known.add('fireball')
        actor.abilities.known.add('greater_fireball')
        const visibleIds = new Set(ids.map(constellationWireId))
        const cards = snapshotConstellations(actor).nodes.filter((node) =>
            visibleIds.has(node.id)
        )
        expect(cards).toHaveLength(7)
        for (const card of cards) {
            expect(card.unlocked).toBe(true)
            expect(card.description).toEqual(expect.any(String))
            expect(card.description).not.toMatch(
                /доступ|изуч|обуч|открыва|уровн|предшествен|класс|практик/i
            )
        }
    })
})

describe('earned constellation metadata', () => {
    it('hides names, descriptions, kind, effects and active/passive type for every unknown node including roots', () => {
        const actor = abilityHero('vanguard')
        const snapshot = snapshotConstellations(actor)
        const roots = snapshot.nodes.filter((node) => node.parents.length === 0)
        expect(roots).toHaveLength(9)
        for (const node of snapshot.nodes) {
            expect(node.id).toMatch(/^node-\d+$/)
            if (node.unlocked) {
                continue
            }
            for (const field of [
                'name',
                'description',
                'kind',
                'effectType',
                'effects',
            ]) {
                expect(Object.hasOwn(node, field)).toBe(false)
            }
        }
        for (const path of snapshot.paths.filter((path) => !path.unlocked)) {
            expect(Object.hasOwn(path, 'name')).toBe(false)
            expect(Object.hasOwn(path, 'description')).toBe(false)
        }
        const json = JSON.stringify(snapshot)
        expect(json).not.toContain('Огненный шар')
        expect(json).not.toContain('Молитва праха')
        expect(json).not.toContain('Возвращение праха')
        expect(json).not.toContain('magic.fireball')
        expect(json).not.toContain('prayer_grave.revive')
    })

    it('discloses an unknown ability only at the immediate frontier, with stable opaque identity', () => {
        const actor = abilityHero('arcanist')
        const fireballId = constellationWireId('magic.fireball')
        const greaterId = constellationWireId('magic.greater_fireball')
        const before = snapshotConstellations(actor)
        expect(
            before.nodes.find((node) => node.id === fireballId)
        ).toMatchObject({ unlocked: false })
        expect(
            before.nodes.find((node) => node.id === greaterId)
        ).toBeUndefined()
        actor.abilities.known.add('fireball')
        const after = snapshotConstellations(actor)
        expect(
            after.nodes.find((node) => node.id === fireballId)
        ).toMatchObject({
            unlocked: true,
            effectType: 'active',
            name: 'Огненный шар',
        })
        const next = after.nodes.find((node) => node.id === greaterId)
        expect(next).toMatchObject({ unlocked: false })
        expect(next?.name).toBeUndefined()
        expect(next?.kind).toBeUndefined()
        expect(next?.effectType).toBeUndefined()
    })
})

describe('dynamic active card capabilities', () => {
    it('publishes only earned extra capabilities in the active card, including automatic cleric resurrection', () => {
        const actor = abilityHero('cleric')
        const card = () => requiredCard(actor, 'prayer.root')
        expect(card().effects).toEqual([
            'Лечит вас или союзника.',
            'Очищает могилы от тёмных сил.',
            'Воскрешает павших товарищей, душа которых ещё не ушла в мир иной.',
        ])
        expect(JSON.stringify(card())).not.toContain('кар')
        actor.progression.constellations.opened.add('prayer.harm')
        expect(card().effects).toContain(
            'Наносит урон нежити в радиусе молитвы.'
        )
        actor.progression.constellations.opened.delete('prayer.harm')
        expect(card().effects).not.toContain(
            'Наносит урон нежити в радиусе молитвы.'
        )
        const unknown = requiredCard(actor, 'prayer.harm')
        expect(unknown.unlocked).toBe(false)
        expect(Object.hasOwn(unknown, 'effects')).toBe(false)
    })
    it('keeps a newly learned non-cleric prayer at its base list until resurrection is actually earned', () => {
        const actor = abilityHero('vanguard')
        actor.abilities.known.add('pray')
        syncAbilityConstellations(actor)
        const card = requiredCard(actor, 'prayer.root')
        expect(card.unlocked).toBe(true)
        expect(card.effects).toEqual([
            'Лечит вас или союзника.',
            'Очищает могилы от тёмных сил.',
        ])
        const revive = requiredCard(actor, 'prayer.revive')
        expect(revive.unlocked).toBe(false)
        expect(Object.hasOwn(revive, 'effects')).toBe(false)
        expect(Object.hasOwn(revive, 'name')).toBe(false)
    })
})

describe('known prayer school cards', () => {
    it('publishes the exact healing root and twenty-node catalogue with correct active and passive cards', () => {
        const actor = abilityHero('cleric')
        const healingNodes = fullConstellationCatalog.filter(
            (node) => node.constellationId === 'prayer'
        )
        expect(healingNodes).toHaveLength(25)
        for (const node of healingNodes) {
            actor.progression.constellations.opened.add(node.id)
        }
        const snapshot = snapshotConstellations(actor)
        const root = snapshot.nodes.find(
            (node) => node.id === constellationWireId('prayer.root')
        )
        expect(root).toMatchObject({
            unlocked: true,
            name: 'Молитва',
            effectType: 'active',
            description:
                'Вы можете помолиться за живых или мёртвых. Есть шанс, что божество ответит на ваши просьбы.',
        })
        expect(root?.effects).toEqual(
            expect.arrayContaining([
                'Лечит вас и всех подходящих союзников в радиусе молитвы.',
                'Очищает могилы от тёмных сил.',
                'Воскрешает павших товарищей, душа которых ещё не ушла в мир иной.',
                'Наносит урон нежити в радиусе молитвы.',
            ])
        )
        const revive = snapshot.nodes.find(
            (node) => node.id === constellationWireId('prayer.revive')
        )
        expect(revive).toMatchObject({
            unlocked: true,
            effectType: 'passive',
            description:
                'Позволяет поднимать павших товарищей, душа которых не успела уйти в мир иной.',
        })
        for (const node of healingNodes.filter(
            (node) => node.kind === 'passive' || node.kind === 'joint'
        )) {
            expect(
                snapshot.nodes.find(
                    (entry) => entry.id === constellationWireId(node.id)
                )
            ).toMatchObject({
                unlocked: true,
                effectType: 'passive',
                description: node.description,
            })
            expect(node.description).not.toMatch(
                /уровн|miracles|faith|шанс.*открыт|Предшествен/i
            )
        }
        expect(
            snapshot.nodes.find(
                (node) => node.id === constellationWireId('prayer.last_light')
            )?.description
        ).toBe(
            'Пока ваше здоровье ниже 20% из-за вражеских ран, ваша молитва лечит на 10% сильнее.'
        )
    })

    it('reveals the separate new roots on learning and only their own explicit abilities', () => {
        const actor = abilityHero('cleric')
        actor.abilities.known.add('pray_road')
        actor.abilities.known.add('pray_lantern')
        actor.abilities.known.add('pray_grave')
        syncAbilityConstellations(actor)
        const snapshot = snapshotConstellations(actor)
        for (const [path, name] of [
            ['prayer_road', 'Молитва странника'],
            ['prayer_lantern', 'Молитва ясности'],
            ['prayer_grave', 'Молитва праха'],
        ] as const) {
            expect(
                snapshot.nodes.find(
                    (node) => node.id === constellationWireId(`${path}.root`)
                )
            ).toMatchObject({ unlocked: true, effectType: 'active', name })
        }
        expect(
            snapshot.nodes.find(
                (node) => node.id === constellationWireId('prayer_grave.revive')
            )
        ).toMatchObject({
            unlocked: true,
            effectType: 'passive',
            name: 'Возвращение праха',
        })
        expect(
            fullConstellationCatalog.filter(
                (node) => node.constellationId === 'prayer_road'
            )
        ).toHaveLength(1)
        expect(
            fullConstellationCatalog.filter(
                (node) => node.constellationId === 'prayer_lantern'
            )
        ).toHaveLength(1)
        expect(
            fullConstellationCatalog.filter(
                (node) => node.constellationId === 'prayer_grave'
            )
        ).toHaveLength(2)
    })
})

it('marks only standalone hotbar bindings active, never enhancement prerequisites or prayer modes', () => {
    const expected = new Map([
        ['arrow.root', 'shot'],
        ['prayer.root', 'pray'],
        ['prayer_road.root', 'pray_road'],
        ['prayer_lantern.root', 'pray_lantern'],
        ['prayer_grave.root', 'pray_grave'],
        ['magic.fireball', 'fireball'],
        ['magic.greater_fireball', 'greater_fireball'],
    ])
    for (const node of fullConstellationCatalog) {
        expect(node.activationAbilityId).toBe(expected.get(node.id))
        expect(node.effectType).toBe(
            expected.has(node.id) ? 'active' : 'passive'
        )
    }
    const enhancement = fullConstellationCatalog.find(
        (node) => node.id === 'magic.fire_damage'
    )
    expect(enhancement?.ability).toBe('fireball')
    expect(enhancement?.activationAbilityId).toBeUndefined()
    expect(enhancement?.effectType).toBe('passive')
})

it('keeps shared catalog definitions deeply frozen while independent personal skies are projected', () => {
    const before = structuredClone(fullConstellationCatalog)
    const first = abilityHero('arcanist')
    const second = abilityHero('cleric')
    snapshotConstellations(first)
    snapshotConstellations(second)
    first.abilities.known.add('fireball')
    snapshotConstellations(first)
    expect(fullConstellationCatalog).toEqual(before)
    expect(Object.isFrozen(fullConstellationCatalog)).toBe(true)
    for (const node of fullConstellationCatalog) {
        expect(Object.isFrozen(node)).toBe(true)
        expect(Object.isFrozen(node.parents)).toBe(true)
        expect(Object.isFrozen(node.evidence)).toBe(true)
        if (node.effects !== undefined) {
            expect(Object.isFrozen(node.effects)).toBe(true)
        }
        expect(Reflect.set(node, 'name', 'Changed shared metadata')).toBe(false)
        expect(Reflect.set(node.parents, '0', 'foreign.root')).toBe(false)
    }
    expect(fullConstellationCatalog).toEqual(before)
})
