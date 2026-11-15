import type { ConstellationNodeSnapshot, HeroClass } from '@my-game-ratata/contracts'
import { ref, shallowRef } from 'vue'

import {
    type ConstellationBuildChange,
    disableConstellationStar,
    enableAllConstellationStars,
    enableConstellationStar,
    initialConstellationBuild,
} from './constellationBuild'

export interface BuildFeedback {
    id: number
    text: string
    missingParents: string[]
}
export interface BuildCascade {
    id: number
    ids: string[]
}
export function useConstellationBuild(
    heroClass: () => HeroClass,
    nodes: () => ConstellationNodeSnapshot[]
) {
    const enabledStarIds = shallowRef<ReadonlySet<string>>(initialConstellationBuild(heroClass()))
    const feedback = ref<BuildFeedback>()
    const lastCascade = ref<BuildCascade>()
    let receipt = 0
    const name = (id: string) => nodes().find((node) => node.id === id)?.name ?? id
    function apply(change: ConstellationBuildChange): void {
        if (change.error || change.missingParents.length) {
            feedback.value = {
                id: ++receipt,
                text:
                    change.error ??
                    `Нужно открыть ${change.missingParents.map((parent) => `«${name(parent)}»`).join(' и ')}.`,
                missingParents: change.missingParents,
            }
            return
        }
        feedback.value = undefined
        if (!change.changed) return
        enabledStarIds.value = change.enabledIds
        if (change.disabledIds.length)
            lastCascade.value = { id: ++receipt, ids: change.disabledIds }
    }
    function activate(id: string): void {
        if (!enabledStarIds.value.has(id)) apply(enableConstellationStar(enabledStarIds.value, id))
    }
    function toggle(id: string): void {
        apply(
            enabledStarIds.value.has(id)
                ? disableConstellationStar(enabledStarIds.value, id)
                : enableConstellationStar(enabledStarIds.value, id)
        )
    }
    function replace(next: ReadonlySet<string>): void {
        const removed = [...enabledStarIds.value].filter((id) => !next.has(id))
        enabledStarIds.value = next
        feedback.value = undefined
        if (removed.length) lastCascade.value = { id: ++receipt, ids: removed }
    }
    return {
        enabledStarIds,
        feedback,
        lastCascade,
        activate,
        toggle,
        clearFeedback: () => {
            feedback.value = undefined
        },
        dismissCascade: () => {
            lastCascade.value = undefined
        },
        clear: () => replace(new Set()),
        enableAll: () => replace(enableAllConstellationStars()),
        reset: () => replace(initialConstellationBuild(heroClass())),
    }
}
