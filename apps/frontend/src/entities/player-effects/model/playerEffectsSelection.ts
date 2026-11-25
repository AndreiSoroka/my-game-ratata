import { computed, readonly, ref, watch } from 'vue'

import type { PlayerEffectKind } from './playerEffects'

export function createPlayerEffectSelection<Effect extends { kind: PlayerEffectKind }>(
    getEffects: () => readonly Effect[]
) {
    const selectedKind = ref<PlayerEffectKind>()
    const selectedEffect = computed(() =>
        getEffects().find((effect) => effect.kind === selectedKind.value)
    )
    watch(selectedEffect, (effect) => {
        if (!effect) selectedKind.value = undefined
    })
    function toggleEffect(kind: PlayerEffectKind): void {
        selectedKind.value = selectedKind.value === kind ? undefined : kind
    }
    return { selectedKind: readonly(selectedKind), selectedEffect, toggleEffect }
}

export function createPlayerEffectsDisclosure(hasEffects: () => boolean) {
    const expanded = ref(false)
    watch(hasEffects, () => {
        expanded.value = false
    })
    return {
        expanded: readonly(expanded),
        toggle: () => {
            expanded.value = !expanded.value
        },
    }
}
