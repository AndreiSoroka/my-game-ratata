import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import type { RatataGame } from '../runtime/ratataGame'
import { adventureFixture, characterFixture, worldFixture } from '../testing/characterFixture'
import MapLoadError from './MapLoadError.vue'
import { worldInteractionActions } from './worldInteractionActions'

it.each(['silent', 'prepared', 'active'] as const)(
    'uses the ordinary interaction only for a prepared bell: %s',
    (state) => {
        const player = characterFixture('self', { position: { x: 100, y: 100 } })
        const snapshot = {
            ...worldFixture([player]),
            adventure: {
                ...adventureFixture(),
                worldObjects: [
                    {
                        id: 'bell',
                        kind: 'bell' as const,
                        name: 'Колокол памяти',
                        position: { x: 100, y: 120 },
                        bounds: { x: 92, y: 112, width: 16, height: 16 },
                        depleted: false,
                        bell: { state },
                    },
                ],
            },
        }
        const actions = worldInteractionActions(snapshot, player)
        expect(actions).toEqual(
            state === 'prepared'
                ? [
                      {
                          id: 'world:bell',
                          label: 'Пробудить: Колокол памяти',
                          command: { type: 'world_interact', objectId: 'bell' },
                      },
                  ]
                : []
        )
        expect(worldInteractionActions(snapshot, player, () => false)).toEqual([])
    }
)

describe('retrying map loading', () => {
    it('provides an accessible explicit retry without retiring the character', async () => {
        const retryMap = vi.fn<(...args: unknown[]) => void>()
        const wrapper = mount(MapLoadError, {
            props: {
                message: 'Карта временно недоступна',
                status: 'Map loading failed',
                game: { retryMap } as unknown as RatataGame,
            },
        })
        expect(wrapper.get('[role="alert"]').text()).toContain('Не удалось загрузить местность')
        await wrapper.get('button').trigger('click')
        expect(retryMap).toHaveBeenCalledOnce()
        await wrapper.setProps({ status: 'Disconnected' })
        expect(wrapper.find('button').exists()).toBe(false)
        wrapper.unmount()
    })
})
