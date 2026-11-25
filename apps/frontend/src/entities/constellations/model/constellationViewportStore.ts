import type { Vector2 } from '@my-game-ratata/contracts'
import { ref } from 'vue'

export function createConstellationViewportStore() {
    const focusedId = ref('')
    const zoom = ref(1)
    const dimensions = ref({ width: 700, height: 450 })
    const offset = ref<Vector2>({ x: 0, y: 0 })
    return { focusedId, zoom, dimensions, offset }
}
