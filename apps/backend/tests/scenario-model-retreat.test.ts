import {
    buildScenarioFromTemplate,
    CENTER_LOCATION_ID,
    parseConfigureScenario,
} from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { scenarioFixture } from './scenarioTestHelpers'

// A live Claude Haiku turn chose these template parameters from the allowed observation.
const configuredByModel = {
    type: 'configure_scenario',
    templateId: 'retreat',
    parameters: { shelterMarkerId: 'marker-3', distanceTiles: 5, dash: true },
    start: true,
}

it.each([
    {
        label: 'a visible enemy four tiles away',
        distanceTiles: 4,
        wall: false,
        retreats: true,
    },
    {
        label: 'an enemy four tiles away behind a wall',
        distanceTiles: 4,
        wall: true,
        retreats: false,
    },
    {
        label: 'a visible enemy six tiles away',
        distanceTiles: 6,
        wall: false,
        retreats: false,
    },
])(
    'executes the model configuration with $label',
    ({ distanceTiles, wall, retreats }) => {
        const config = parseConfigureScenario(configuredByModel)
        if (config === undefined) {
            throw new Error(
                'Expected the model to produce a valid template configuration.'
            )
        }
        const f = scenarioFixture()
        const origin = { x: 24, y: 24 }
        const shelter = { x: 24, y: 104 }
        f.command({ type: 'marker_create', name: 'First' })
        f.command({ type: 'marker_create', name: 'Second' })
        f.actor.position = shelter
        f.command({ type: 'marker_create', name: 'Shelter' })
        f.actor.position = origin
        if (wall) {
            f.navigation.grid.solid[30 + 3] = true
        }
        f.setThreat(
            new GameCharacter({
                id: 'threat',
                nickname: 'Threat',
                archetype: 'slime',
                controllerKind: 'mob1',
                locationId: CENTER_LOCATION_ID,
                spawnPosition: {
                    x: origin.x + distanceTiles * 16,
                    y: origin.y,
                },
            })
        )
        f.start(
            buildScenarioFromTemplate(
                config.templateId,
                'model',
                'Retreat',
                config.parameters
            )
        )
        f.tick(60)
        expect(f.actor.position).toEqual(retreats ? shelter : origin)
        f.command({ type: 'scenario_delete', scenarioId: 'model' })
        expect(f.snapshot().scenarios).toEqual([])
        expect(f.snapshot().markers.map(({ id }) => id)).toContain('marker-3')
    }
)
