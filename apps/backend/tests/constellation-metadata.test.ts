import { describe, expect, it } from 'vitest'

import {
    constellationWireId,
    fullConstellationCatalog,
} from '../src/game/constellationNodes'
import { syncAbilityConstellations } from '../src/game/constellations'
import { snapshotConstellations } from '../src/game/constellationSnapshot'
import { abilityHero } from './abilityTestHelpers'

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
        actor.progression.skills.fireball.unlocked = true
        actor.progression.skills.greater_fireball.unlocked = true
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
        actor.progression.skills.fireball.unlocked = true
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

describe('known prayer school cards', () => {
    it('publishes the exact healing root and twenty-node catalogue with correct active and passive cards', () => {
        const actor = abilityHero('cleric')
        const healingNodes = fullConstellationCatalog.filter(
            (node) => node.constellationId === 'prayer'
        )
        expect(healingNodes).toHaveLength(20)
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
            effects: [
                'Лечит вас или союзника.',
                'Очищает могилы от тёмных сил.',
            ],
        })
        const revive = snapshot.nodes.find(
            (node) => node.id === constellationWireId('prayer.revive')
        )
        expect(revive).toMatchObject({
            unlocked: true,
            effectType: 'active',
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
            effectType: 'active',
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
