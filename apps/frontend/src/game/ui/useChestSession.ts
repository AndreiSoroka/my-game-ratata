import type { CharacterSnapshot, ClientMessage, WorldSnapshot } from '@my-game-ratata/contracts'
import { computed, type Ref, ref, watch } from 'vue'

export function useChestSession(options: {
    snapshot: Ref<WorldSnapshot | undefined>
    player: Ref<CharacterSnapshot | undefined>
    connected: () => boolean
    send: (command: ClientMessage) => void
    onOpen: () => void
}) {
    const dismissedId = ref<string>()
    let locationId: string | undefined
    const confirmed = computed(() => options.snapshot.value?.chest)
    const chest = computed(() =>
        confirmed.value &&
        options.connected() &&
        options.player.value?.alive &&
        dismissedId.value !== confirmed.value.chestId
            ? confirmed.value
            : undefined
    )
    const close = (): void => {
        if (!confirmed.value) return
        dismissedId.value = confirmed.value.chestId
        options.send({ type: 'close_chest', chestId: confirmed.value.chestId })
    }
    watch(
        () => confirmed.value?.chestId,
        (id) => {
            if (!id) dismissedId.value = undefined
        }
    )
    watch(
        () => chest.value?.chestId,
        (id) => {
            const player = options.player.value
            if (!id || !player) return
            locationId = options.snapshot.value?.location?.id
            options.send({ type: 'move_input', axis: { x: 0, y: 0 } })
            options.onOpen()
        },
        { immediate: true }
    )
    watch(
        () => options.snapshot.value?.location?.id,
        (id) => {
            if (chest.value && locationId !== undefined && id !== locationId) close()
        }
    )
    watch(
        () => options.player.value?.alive,
        (alive) => {
            if (alive === false) close()
        }
    )
    watch(options.connected, (connected) => {
        if (!connected) dismissedId.value = confirmed.value?.chestId
    })
    return { chest, close, pending: computed(() => Boolean(confirmed.value)) }
}
