import { forwardAbilityAttack, forwardShot, type ProjectilePath } from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, reactive, ref } from 'vue'

import { characterFixture } from '../../../game/testing/characterFixture'
import type { HotbarProps } from './hotbarActions'
import type { HotbarBinding } from './hotbarBindings'
import { useShotPreview } from './useShotPreview'

it('projects independent Shot and Spark corridors from the same facing', () => {
    for (const facing of ['up', 'down', 'left', 'right'] as const) {
        const path = forwardAbilityAttack({ x: 20, y: 30 }, facing, 'spark')
        expect(Math.hypot(path.endpoint.x - path.origin.x, path.endpoint.y - path.origin.y)).toBe(
            80
        )
        expect(path.halfWidth).toBe(16)
        const shot = forwardShot({ x: 20, y: 30 }, facing)
        expect(Math.hypot(shot.endpoint.x - shot.origin.x, shot.endpoint.y - shot.origin.y)).toBe(
            64
        )
    }
})

it('uses the assigned directional ability, hides its guide for explicit targets and releases it on teardown', async () => {
    const props = reactive<HotbarProps>({
        player: characterFixture('mage', { facing: 'right', position: { x: 100, y: 100 } }),
        characters: [],
        blocked: false,
    })
    const bindings = ref<(HotbarBinding | null)[]>([
        { kind: 'attack' },
        { kind: 'ability', id: 'spark' },
        null,
        null,
    ])
    const emit = vi.fn<(event: 'shotPreviewChange', path: ProjectilePath | undefined) => void>()
    const wrapper = mount(
        defineComponent({
            setup() {
                useShotPreview(props, bindings, emit)
                return () => h('div')
            },
        })
    )
    expect(emit).toHaveBeenLastCalledWith('shotPreviewChange', {
        origin: { x: 100, y: 100 },
        endpoint: { x: 180, y: 100 },
        halfWidth: 16,
    })
    props.player.facing = 'up'
    await nextTick()
    expect(emit).toHaveBeenLastCalledWith('shotPreviewChange', {
        origin: { x: 100, y: 100 },
        endpoint: { x: 100, y: 20 },
        halfWidth: 16,
    })
    props.target = characterFixture('enemy', { faction: 'monsters', relationship: 'hostile' })
    await nextTick()
    expect(emit).toHaveBeenLastCalledWith('shotPreviewChange', undefined)
    props.target = undefined
    bindings.value[1] = { kind: 'ability', id: 'shot' }
    await nextTick()
    expect(emit).toHaveBeenLastCalledWith(
        'shotPreviewChange',
        forwardShot(props.player.position, 'up')
    )
    props.blocked = true
    await nextTick()
    expect(emit).toHaveBeenLastCalledWith('shotPreviewChange', undefined)
    wrapper.unmount()
    const calls = emit.mock.calls.length
    props.player.facing = 'left'
    await nextTick()
    expect(emit).toHaveBeenCalledTimes(calls)
})
