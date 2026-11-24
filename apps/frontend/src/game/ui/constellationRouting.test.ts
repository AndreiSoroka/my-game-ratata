import type { ConstellationSnapshot } from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import { ConstellationGraph } from '@/entities/constellations'

import {
    constellationWireId,
    fullConstellationCatalog,
} from '../../../../backend/src/game/constellationNodes'
import { characterFixture } from '../testing/characterFixture'
import { constellationFixture } from '../testing/developmentFixture'
import { masteriesFixture } from '../testing/masteryFixture'
import CharacterDevelopment from './CharacterDevelopment.vue'

function routedSky(learned: boolean): ConstellationSnapshot {
    const source = constellationWireId('blade.root')
    const target = constellationWireId('blade.ideal_position')
    return {
        version: 1,
        paths: [
            { id: 'blade', name: 'Клинок', unlocked: true, color: '#f80' },
            { id: 'prayer', unlocked: false, color: '#fa0' },
        ],
        nodes: [
            {
                id: source,
                constellationId: 'blade',
                x: -200,
                y: 0,
                parents: [],
                unlocked: true,
                kind: 'root',
                name: 'Клинок',
            },
            {
                id: target,
                constellationId: 'blade',
                x: 200,
                y: 0,
                parents: [source],
                unlocked: learned,
                ...(learned ? { name: 'Идеальное положение', kind: 'joint' as const } : {}),
            },
            {
                id: constellationWireId('prayer.root'),
                constellationId: 'prayer',
                x: 0,
                y: 0,
                parents: [],
                unlocked: false,
            },
        ],
        edges: [
            {
                from: source,
                to: target,
                crossLink: true,
                via: [
                    { x: -120, y: -120 },
                    { x: 120, y: -120 },
                ],
            },
        ],
    }
}

it.each([false, true])(
    'draws a direct prerequisite link in the player window (learned=%s)',
    async (learned) => {
        const sky = routedSky(learned)
        const player = characterFixture('routed-reader', {
            heroClass: 'vanguard',
            progression: {
                masteries: masteriesFixture(),
                deity: {
                    id: 'hearth',
                    name: 'Угольная Мать',
                    domain: 'Исцеление',
                    omen: '',
                    perception: 'vague',
                    mood: null,
                    successChance: null,
                    changesInMs: null,
                },
                magicChaptersRead: 0,
                magicChaptersTotal: 3,
                resurrectionUnlocked: false,
                constellations: sky,
            },
        })
        const before = structuredClone(sky)
        const view = mount(CharacterDevelopment, { props: { player, characters: [] } })
        try {
            const links = view.findAll('polyline')
            expect(links).toHaveLength(1)
            expect(links[0]!.attributes('points')).toBe('-200,0 200,0')
            expect(links[0]!.attributes('stroke-dasharray')).toBe('8 4 2 4')
            expect(links[0]!.attributes('opacity')).toBe(learned ? '0.7' : '0')
            await view.get(`[data-node-id="${constellationWireId('blade.root')}"]`).trigger('click')
            view.getComponent(ConstellationGraph).vm.focusNode(
                constellationWireId('blade.ideal_position')
            )
            await view.vm.$nextTick()
            const target = view.get(
                `[data-node-id="${constellationWireId('blade.ideal_position')}"]`
            )
            expect(target.attributes('aria-hidden')).toBe(learned ? undefined : 'true')
            expect(sky.nodes.every((node) => !node.id.startsWith('blade.'))).toBe(true)
            expect(sky).toEqual(before)
            expect(view.emitted('command')).toBeUndefined()
        } finally {
            view.unmount()
        }
    }
)

it('keeps extra mandatory prerequisites marked in the player development preview', () => {
    const sky = constellationFixture(true, 'vanguard')
    const expected = fullConstellationCatalog.flatMap((node) =>
        node.parents
            .slice(1)
            .map((parent) => `${constellationWireId(parent)}>${constellationWireId(node.id)}`)
    )
    expect(expected.length).toBeGreaterThan(0)
    expect(
        sky.edges.filter((edge) => edge.crossLink).map((edge) => `${edge.from}>${edge.to}`)
    ).toEqual(expected)
})
