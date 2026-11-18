import type { ConstellationSnapshot } from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import {
    constellationWireId,
    fullConstellationCatalog,
} from '../../../../backend/src/game/constellationNodes'
import { characterFixture } from '../testing/characterFixture'
import { constellationFixture } from '../testing/developmentFixture'
import { masteriesFixture } from '../testing/masteryFixture'
import CharacterDevelopment from './CharacterDevelopment.vue'
import { observedPathBounds } from './constellationFocusRegion'
import ConstellationGraph from './ConstellationGraph.vue'
import { constellationLabels } from './constellationLabels'

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
    'keeps the server detour around another constellation in the player window (learned=%s)',
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
            expect(links[0]!.attributes('points')).toBe('-200,0 -120,-120 120,-120 200,0')
            expect(links[0]!.attributes('stroke-dasharray')).toBe('8 4 2 4')
            expect(view.findAll('line')).toHaveLength(0)
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

it('labels the constellation by its earned path name while the root action keeps its name', () => {
    const sky = routedSky(false)
    sky.nodes = [
        {
            id: 'root',
            constellationId: 'prayer',
            x: 0,
            y: 0,
            parents: [],
            unlocked: true,
            name: 'Молитва',
        },
    ]
    sky.edges = []
    sky.paths = [{ id: 'prayer', unlocked: true, color: '#fa0', name: 'Угольная Мать' }]
    const labels = () =>
        constellationLabels(sky, 'root', false, 1, { x: -250, y: -200, width: 500, height: 400 })
    expect(labels()[0]?.text).toBe('Угольная Мать')
    expect(sky.nodes[0]!.name).toBe('Молитва')
    sky.paths[0]!.name = undefined
    expect(labels()[0]?.text).toBe('Молитва')
    sky.paths[0]!.unlocked = false
    sky.nodes[0]!.unlocked = false
    sky.nodes[0]!.name = undefined
    expect(labels()[0]?.text).toBe('Неизвестно')
})

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

it('fits only received nodes and internal bends rather than foreign corridors or hidden path extents', () => {
    const sky = routedSky(false)
    sky.edges.push({ from: sky.nodes[0]!.id, to: sky.nodes[2]!.id, via: [{ x: 10000, y: 10000 }] })
    expect(observedPathBounds(sky, 'blade')).toEqual({ x: -200, y: -120, width: 400, height: 120 })
})
