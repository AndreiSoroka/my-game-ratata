import type { ConstellationSnapshot } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { characterFixture, worldFixture } from '../testing/characterFixture'
import { createConstellationNotices } from './constellationNotices'

function sky(roots = ['blade'], names: string[] = []): ConstellationSnapshot {
    return {
        version: 1,
        paths: (['blade', 'magic'] as const).map((id) => ({
            id,
            color: '#fff',
            unlocked: roots.includes(id),
            ...(roots.includes(id) ? { name: id === 'blade' ? 'Клинок' : 'Магия' } : {}),
        })),
        nodes: [
            {
                id: 'node-1',
                constellationId: 'blade',
                x: 0,
                y: 0,
                parents: [],
                unlocked: true,
                kind: 'root',
                name: 'Клинок',
            },
            ...names.map((name, index) => ({
                id: `node-${index + 2}`,
                constellationId: 'blade' as const,
                x: 0,
                y: 0,
                parents: ['node-1'],
                unlocked: true,
                kind: 'passive' as const,
                name,
            })),
        ],
        edges: [],
    }
}

function world(value: ConstellationSnapshot | undefined, id = 'self', epoch = 'one', alive = true) {
    const actor = characterFixture(id, {
        alive,
        ...(value === undefined
            ? {}
            : {
                  progression: {
                      masteries: [],
                      constellations: value,
                      deity: {
                          id: 'hearth' as const,
                          name: 'Очаг',
                          domain: '',
                          omen: '',
                          perception: 'vague' as const,
                          mood: null,
                          successChance: null,
                          changesInMs: null,
                      },
                      magicChaptersRead: 0,
                      magicChaptersTotal: 3,
                      resurrectionUnlocked: false,
                  },
              }),
    })
    return { ...worldFixture([actor]), serverEpoch: epoch }
}

describe('private constellation discovery notices', () => {
    it('silently establishes the first private sky, including already learned stars', () => {
        const notices = createConstellationNotices()
        expect(notices.observe(world(undefined), 'self')).toBeUndefined()
        expect(notices.observe(world(sky(['blade'], ['Сила'])), 'self')).toBeUndefined()
        expect(notices.observe(world(sky(['blade'], ['Сила'])), 'self')).toBeUndefined()
    })

    it('groups a new path and every newly learned nonroot star into one notice', () => {
        const notices = createConstellationNotices()
        notices.observe(world(sky()), 'self')
        const updated = sky(['blade', 'magic'], ['Сила', 'Стойкость'])
        updated.nodes.push({
            id: 'node-20',
            constellationId: 'magic',
            x: 0,
            y: 0,
            parents: [],
            kind: 'root',
            unlocked: true,
            name: 'Магия',
        })
        const notice = notices.observe(world(updated), 'self')
        expect(notice?.notice).toBe(
            'Открыто созвездие: «Магия». Открыты звёзды: «Сила», «Стойкость».'
        )
        expect(notice?.noticeId).toContain('constellation:')
        expect(notices.observe(world(updated), 'self')).toBeUndefined()
    })

    it('detects a closed neighbor becoming learned and a learned node first appearing together', () => {
        const notices = createConstellationNotices()
        const initial = sky()
        initial.nodes.push({
            id: 'node-2',
            constellationId: 'blade',
            x: 0,
            y: 0,
            parents: ['node-1'],
            unlocked: false,
        })
        notices.observe(world(initial), 'self')
        expect(notices.observe(world(sky(['blade'], ['Сила', 'Стойкость'])), 'self')?.notice).toBe(
            'Открыты звёзды: «Сила», «Стойкость».'
        )
    })

    it('retains learned IDs across missing private data, partial skies, travel and temporary death', () => {
        const notices = createConstellationNotices()
        notices.observe(world(sky()), 'self')
        const learned = world(sky(['blade'], ['Сила']))
        expect(notices.observe(learned, 'self')?.notice).toContain('Сила')
        notices.observe(world(undefined), 'self')
        notices.observe(world(sky()), 'self')
        notices.observe({ ...learned, characters: [] }, 'self')
        notices.observe(learned, undefined)
        notices.observe(world(sky(), 'self', 'one', false), 'self')
        expect(notices.observe(learned, 'self')).toBeUndefined()
    })

    it('does not announce another character’s sky or discoveries while dead', () => {
        const notices = createConstellationNotices()
        notices.observe(world(sky()), 'self')
        expect(
            notices.observe(world(sky(['blade', 'magic'], ['Чужая звезда']), 'other'), 'self')
        ).toBeUndefined()
        expect(
            notices.observe(world(sky(['blade'], ['Сила']), 'self', 'one', false), 'self')
        ).toBeUndefined()
        expect(notices.observe(world(sky(['blade'], ['Сила'])), 'self')).toBeUndefined()
    })

    it('silently resets the baseline for a new identity, world or runtime', () => {
        const notices = createConstellationNotices()
        notices.observe(world(sky()), 'self')
        expect(notices.observe(world(sky(['blade'], ['Сила']), 'new'), 'new')).toBeUndefined()
        expect(
            notices.observe(world(sky(['blade'], ['Сила', 'Стойкость']), 'new', 'two'), 'new')
        ).toBeUndefined()
        expect(
            createConstellationNotices().observe(world(sky(['blade'], ['Сила'])), 'self')
        ).toBeUndefined()
    })
})
