import { forwardAbilityAttack, forwardShot, type ProjectilePath } from '@my-game-ratata/contracts'
import { computed, onBeforeUnmount, type Ref, watch } from 'vue'

import { attackableTarget } from './combatTargeting'
import type { HotbarProps } from './hotbarActions'
import type { HotbarBinding } from './hotbarBindings'

export function useShotPreview(
    props: HotbarProps,
    bindings: Ref<(HotbarBinding | null)[]>,
    emit: (event: 'shotPreviewChange', path: ProjectilePath | undefined) => void
): void {
    const preview = computed(() => {
        // The first directional slot owns the single world-space guide.
        const assigned = bindings.value.find(
            (binding) => binding?.kind === 'ability' && ['shot', 'spark'].includes(binding.id)
        )
        const targeted =
            props.grave || (props.target && attackableTarget(props.target, props.player))
        if (assigned?.kind !== 'ability' || props.blocked || !props.player.alive || targeted)
            return undefined
        return assigned.id === 'spark'
            ? forwardAbilityAttack(props.player.position, props.player.facing, 'spark')
            : forwardShot(props.player.position, props.player.facing)
    })
    watch(preview, (path) => emit('shotPreviewChange', path), { immediate: true })
    onBeforeUnmount(() => emit('shotPreviewChange', undefined))
}
