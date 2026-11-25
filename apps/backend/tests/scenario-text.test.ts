import {
    buildScenarioFromTemplate,
    FARM_PLOTS,
    formatScenarioText,
    parseScenarioText,
    scenarioTemplates,
    validateScenarioDefinition,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { parseClientMessage } from '../src/game/messages'

const markers = [
    { number: 1, id: 'grove' },
    { number: 2, id: 'store' },
    { number: 3, id: 'shelter' },
]
const options = { id: 'wood', name: 'Моя рубка', markers }
const source = [
    'repeat forever',
    'main {',
    '  go marker(1)',
    '  gather wood 3',
    '  go marker(2)',
    '  deposit acquired wood',
    '}',
    'sequence "Скрыться" {',
    '  cast barrier self',
    '  go marker(3) dash',
    '}',
    'on enemy_visible(5 tiles) after 1s -> "Скрыться" notify "Враг рядом"',
].join('\n')

describe('scenario authoring and save validation', () => {
    it('round-trips meaningful fields and preserves existing step identities', () => {
        const parsed = parseScenarioText(source, options)
        expect(parsed.ok).toBe(true)
        if (!parsed.ok) {
            return
        }
        expect(parsed.scenario.reactions[0]).toMatchObject({
            delayMs: 1000,
            notification: 'Враг рядом',
            trigger: { kind: 'enemy_visible', distanceTiles: 5 },
        })
        expect(formatScenarioText(parsed.scenario, markers)).toBe(
            source
                .replace('forever\n', 'forever\n\n')
                .replace('}\nsequence', '}\n\nsequence')
                .replace('}\non', '}\n\non')
        )
        expect(
            parseScenarioText(formatScenarioText(parsed.scenario, markers), {
                ...options,
                previous: parsed.scenario,
            })
        ).toEqual(parsed)
    })

    it.each([
        ['gather wood 3', 'teleport 1', 4],
        ['cast barrier self', 'cast spark self', 9],
        ['go marker(1)', 'go marker(42)', 3],
        ['go marker(1)', 'go marker("someone-elses-marker")', 3],
        ['-> "Скрыться"', '-> "Неизвестная цепочка"', 12],
    ])(
        'pinpoints an unknown or malformed command before save',
        (from, to, line) => {
            expect(
                parseScenarioText(source.replace(from, to), options)
            ).toMatchObject({ ok: false, line })
        }
    )

    it('rejects unsupported and legacy commands at the socket boundary', () => {
        const message = (scenario: unknown) =>
            parseClientMessage(
                JSON.stringify({ type: 'scenario_save', scenario })
            )
        expect(
            message({ ...options, steps: [], threat: 'continue' }).error
        ).toBeDefined()
        expect(
            message({
                id: 'unknown',
                name: 'Unknown',
                main: [{ id: 'step', kind: 'teleport' }],
                sequences: [],
                reactions: [],
                repeat: 1,
            }).error
        ).toContain('Unknown')
    })

    it.each(scenarioTemplates)(
        'builds and serializes the $id template',
        ({ id }) => {
            const plot = FARM_PLOTS[0]
            if (plot === undefined) {
                throw new Error('Expected an authored farm plot.')
            }
            const definition = buildScenarioFromTemplate(id, 'copy', 'Copy', {
                workMarkerId: 'grove',
                storageMarkerId: 'store',
                secondMarkerId: 'store',
                ...(id === 'retreat'
                    ? { shelterMarkerId: 'shelter', abilityId: 'barrier' }
                    : {}),
                plotId: plot.id,
                plotLocationId: plot.locationId,
            })
            const validated = validateScenarioDefinition(definition, {
                markers,
            })
            expect(validated.ok).toBe(true)
            expect(
                parseScenarioText(formatScenarioText(definition, markers), {
                    id: definition.id,
                    name: definition.name,
                    markers,
                    previous: definition,
                })
            ).toEqual(validated)
        }
    )

    it('binds a nearby friendly target only while the actor is not following', () => {
        const definition = buildScenarioFromTemplate(
            'follow',
            'friend',
            'Follow',
            { distanceTiles: 3 }
        )
        expect(definition.reactions[0]?.trigger).toEqual({
            kind: 'friendly_nearby',
            distanceTiles: 3,
            onlyWhenNotFollowing: true,
        })
        expect(definition.sequences[0]?.steps[0]).toMatchObject({
            kind: 'follow',
            target: 'reaction_target',
        })
        expect(
            validateScenarioDefinition({
                ...definition,
                reactions: definition.reactions.map((reaction) => ({
                    ...reaction,
                    trigger: { kind: 'enemy_visible', distanceTiles: 3 },
                })),
            }).ok
        ).toBe(false)
    })
})
