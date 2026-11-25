import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CompanionService } from '../src/game/companions'
import { loadNavigationService } from '../src/game/navigation'
import { createSupportNpcs } from '../src/game/supportNpcs'
import { createWandererScenario } from '../src/game/wandererScenarios'

afterEach(() => vi.unstubAllGlobals())

describe('authored idle city scenarios', () => {
    it('provides two distinct reachable city walks to the ordinary shared scenario runner', () => {
        vi.stubGlobal('Bun', { env: {} })
        const navigation = loadNavigationService(CENTER_LOCATION_ID)
        const wanderers = createSupportNpcs(
            navigation,
            new CompanionService()
        ).filter(({ character }) => character.id.startsWith('npc_wanderer_'))
        expect(wanderers).toHaveLength(2)
        for (const { character } of wanderers) {
            expect(character.soul).toMatchObject({
                kind: 'echo',
                controlSource: 'script',
                canSpeak: true,
            })
            const scenario = createWandererScenario(character, navigation)
            expect(scenario?.repeat).toBeNull()
            const walks =
                scenario?.main.filter((step) => step.kind === 'go') ?? []
            expect(scenario?.reactions).toContainEqual({
                id: 'danger',
                trigger: { kind: 'enemy_visible', distanceTiles: 15 },
                sequenceId: 'shelter',
            })
            expect(walks.length).toBeGreaterThanOrEqual(2)
            for (const step of walks) {
                if (step.destination.kind !== 'point') {
                    throw new Error('Expected an authored city point')
                }
                expect(step.destination.locationId).toBe(CENTER_LOCATION_ID)
                expect(
                    navigation.findPathWorld(
                        character.spawnPosition,
                        step.destination.position
                    ).length
                ).toBeGreaterThan(0)
            }
        }
    })
})
