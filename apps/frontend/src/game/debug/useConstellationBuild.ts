import type { ConstellationNodeSnapshot, HeroClass } from '@my-game-ratata/contracts'
import { onScopeDispose, ref, shallowRef, watch } from 'vue'

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
export type BuildNoticePause = 'pointer' | 'focus'
export function useConstellationBuild(
    heroClass: () => HeroClass,
    nodes: () => ConstellationNodeSnapshot[]
) {
    const enabledStarIds = shallowRef<ReadonlySet<string>>(initialConstellationBuild(heroClass()))
    watch(heroClass, (next) => {
        enabledStarIds.value = new Set([
            ...enabledStarIds.value,
            ...initialConstellationBuild(next),
        ])
    })
    const { feedback, lastCascade, clearNotice, scheduleNotice, pauseNotice, resumeNotice } =
        useBuildNotices()
    let receipt = 0
    const name = (id: string) => nodes().find((node) => node.id === id)?.name ?? id
    function apply(change: ConstellationBuildChange): void {
        clearNotice()
        if (change.error || change.missingParents.length) {
            feedback.value = {
                id: ++receipt,
                text:
                    change.error ??
                    `Нужно открыть ${change.missingParents.map((parent) => `«${name(parent)}»`).join(' и ')}.`,
                missingParents: change.missingParents,
            }
            scheduleNotice(6000)
            return
        }
        if (!change.changed) return
        enabledStarIds.value = change.enabledIds
        if (change.disabledIds.length) {
            lastCascade.value = { id: ++receipt, ids: change.disabledIds }
            scheduleNotice(4000)
        }
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
        clearNotice()
        if (removed.length) {
            lastCascade.value = { id: ++receipt, ids: removed }
            scheduleNotice(4000)
        }
    }
    return {
        enabledStarIds,
        feedback,
        lastCascade,
        activate,
        toggle,
        clearFeedback: () => {
            if (feedback.value) clearNotice()
        },
        pauseNotice,
        resumeNotice,
        clear: () => replace(new Set()),
        enableAll: () => replace(enableAllConstellationStars()),
        reset: () => replace(initialConstellationBuild(heroClass())),
    }
}

function useBuildNotices() {
    const feedback = ref<BuildFeedback>()
    const lastCascade = ref<BuildCascade>()
    let timer: ReturnType<typeof setTimeout> | undefined
    let remaining = 0
    let deadline = 0
    const paused = new Set<BuildNoticePause>()
    function cancelTimer(): void {
        if (timer !== undefined) clearTimeout(timer)
        timer = undefined
    }
    function clearNotice(): void {
        cancelTimer()
        feedback.value = undefined
        lastCascade.value = undefined
        paused.clear()
        remaining = 0
    }
    function scheduleNotice(duration: number): void {
        cancelTimer()
        remaining = duration
        deadline = Date.now() + duration
        timer = setTimeout(clearNotice, duration)
    }
    function pauseNotice(reason: BuildNoticePause): void {
        if (!feedback.value && !lastCascade.value) return
        if (!paused.size) {
            remaining = Math.max(0, deadline - Date.now())
            cancelTimer()
        }
        paused.add(reason)
    }
    function resumeNotice(reason: BuildNoticePause): void {
        if (!paused.delete(reason)) return
        if (!paused.size && (feedback.value || lastCascade.value)) scheduleNotice(remaining)
    }
    onScopeDispose(clearNotice)
    return { feedback, lastCascade, clearNotice, scheduleNotice, pauseNotice, resumeNotice }
}
