import {
    CENTER_LOCATION_ID,
    type ClientMessage,
    GRID_SIZE,
    REGION_NAME,
    WORLD_LOCATION_DEFINITIONS,
    type WorldLocation,
} from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import { defineComponent, nextTick, ref, shallowRef } from 'vue'

import type { RatataGame } from '../runtime/ratataGame'
import { characterFixture, worldFixture } from '../testing/characterFixture'
import { useCharacterApproach } from './useCharacterApproach'

const location: WorldLocation = {
    ...WORLD_LOCATION_DEFINITIONS.find((entry) => entry.id === CENTER_LOCATION_ID)!,
    columns: GRID_SIZE,
    rows: GRID_SIZE,
    regionName: REGION_NAME,
    map: {
        asset: { url: '/world/test-map.json', revision: 'test' },
        id: CENTER_LOCATION_ID,
        width: 16,
        height: 16,
        tileWidth: 16,
        tileHeight: 16,
        worldWidth: 256,
        worldHeight: 256,
        solidLayerNames: [],
    },
}

function setup() {
    const player = characterFixture('player')
    const target = characterFixture('resident', { position: { x: 100, y: 0 } })
    const snapshot = shallowRef({ ...worldFixture([player, target]), location })
    const selectedId = ref<string>()
    const actions: (ClientMessage | { open: string })[] = []
    const sendCommand = (message: ClientMessage): void => {
        wrapper.vm.command(message)
        actions.push(message)
    }
    const game = shallowRef({
        canSelectTarget: () => true,
        isInteractionVisible: () => true,
        sendCommand,
    } as unknown as RatataGame)
    const wrapper = mount(
        defineComponent({
            setup: () =>
                useCharacterApproach({
                    game,
                    snapshot,
                    player: () => snapshot.value.characters[0],
                    selectedId: () => selectedId.value,
                    blocked: () => false,
                    select: (id) => {
                        selectedId.value = id
                        return true
                    },
                    canOpen: (id) =>
                        id === target.id &&
                        Math.abs(target.position.x - snapshot.value.characters[0]!.position.x) <=
                            48,
                    open: (id) => actions.push({ open: id }),
                }),
            template: '<div />',
        })
    )
    async function publishPosition(x: number): Promise<void> {
        snapshot.value = {
            ...snapshot.value,
            characters: [{ ...player, position: { x, y: 0 } }, target],
            serverTime: snapshot.value.serverTime + 50,
        }
        await nextTick()
    }
    return { wrapper, target, actions, publishPosition, sendCommand }
}

it('approaches the pinned resident, then cancels movement before opening at the reach boundary', async () => {
    const { wrapper, target, actions, publishPosition } = setup()
    const route = { type: 'move_to', target: target.position }
    try {
        await wrapper.vm.begin(target.id)
        expect(actions).toEqual([route])
        await publishPosition(51)
        expect(actions).toEqual([route])
        await publishPosition(52)
        expect(actions).toEqual([route, { type: 'cancel_control' }, { open: target.id }])

        await publishPosition(53)
        expect(actions).toHaveLength(3)
    } finally {
        wrapper.unmount()
    }
})

it('cancels an automatic approach before manual movement without opening on later arrival', async () => {
    const { wrapper, target, actions, publishPosition, sendCommand } = setup()
    const movement = { type: 'move_input', axis: { x: 1, y: 0 } } as const
    try {
        await wrapper.vm.begin(target.id)
        sendCommand(movement)
        await publishPosition(52)
        expect(actions).toEqual([
            { type: 'move_to', target: target.position },
            { type: 'cancel_control' },
            movement,
        ])
    } finally {
        wrapper.unmount()
    }
})
