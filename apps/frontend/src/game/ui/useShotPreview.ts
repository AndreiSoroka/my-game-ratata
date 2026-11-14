import { forwardShot, type ProjectilePath } from '@my-game-ratata/contracts'
import { computed, onBeforeUnmount, type Ref, watch } from 'vue'

import { relation } from './combatTargeting'
import type { HotbarProps } from './hotbarActions'
import type { HotbarBinding } from './hotbarBindings'

export function useShotPreview(
    props: HotbarProps,
    bindings: Ref<(HotbarBinding | null)[]>,
    emit: (event: 'shotPreviewChange', path: ProjectilePath | undefined) => void
): void {
    const preview = computed(() => {
        const assigned = bindings.value.some(
            (binding) => binding?.kind === 'ability' && binding.id === 'shot'
        )
        const targeted =
            props.grave || (props.target && relation(props.target, props.player) === 'hostile')
        if (!assigned || props.blocked || !props.player.alive || targeted) return undefined
        return forwardShot(props.player.position, props.player.facing)
    })
    watch(preview, (path) => emit('shotPreviewChange', path), { immediate: true })
    onBeforeUnmount(() => emit('shotPreviewChange', undefined))
}
