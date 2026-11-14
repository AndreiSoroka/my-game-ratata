import type { CharacterSnapshot, WorldSnapshot } from '@my-game-ratata/contracts'
import { computed, type Ref, ref, watch } from 'vue'

import type { RatataGame } from '../runtime/ratataGame'

export function useGraveSelection(
    props: { snapshot: WorldSnapshot; player: CharacterSnapshot; game?: RatataGame },
    selectedId: Ref<string | undefined>,
    cancel: () => void,
    release: () => void = cancel
) {
    const selectedGraveId = ref<string>()
    const grave = computed(() =>
        props.snapshot.graves?.find((entry) => entry.id === selectedGraveId.value)
    )
    const clearGrave = () => {
        selectedGraveId.value = undefined
    }
    function selectGrave(id: string): void {
        const candidate = props.snapshot.graves?.find((entry) => entry.id === id)
        if (!props.player.alive || !candidate || candidate.phase === 'purified') return
        if (selectedGraveId.value !== id) cancel()
        selectedId.value = undefined
        selectedGraveId.value = id
    }
    watch(selectedGraveId, (id, previous) => {
        if (id !== previous) release()
    })
    watch(selectedId, (id) => {
        if (id) clearGrave()
    })
    watch(
        [() => props.player.id, () => props.player.alive, () => props.snapshot.location?.id],
        clearGrave
    )
    watch(grave, (current, previous) => {
        if (!selectedGraveId.value) return
        if (
            !current ||
            current.phase === 'purified' ||
            props.game?.isPositionVisible(current.position) === false
        )
            clearGrave()
        else if (current.phase !== previous?.phase) release()
    })
    return { selectedGraveId, grave, selectGrave, clearGrave }
}
