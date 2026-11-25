import { readonly, shallowRef } from 'vue'

export const playerResourceKinds = ['hp', 'mana', 'energy'] as const

export interface PlayerVitalsResources {
    hpPercent: number
    manaPercent: number
    energyPercent: number
    hpSegments?: readonly number[]
    manaSegments?: readonly number[]
    energySegments?: readonly number[]
    hpCurrent?: number | undefined
    hpMax?: number | undefined
    manaCurrent?: number | undefined
    manaMax?: number | undefined
    energyCurrent?: number | undefined
    energyMax?: number | undefined
}

export interface PlayerVitalsData extends PlayerVitalsResources {
    nickname: string
}

export function createPlayerVitalsStore(initial: PlayerVitalsResources) {
    const resources = shallowRef(copyResources(initial))

    return {
        resources: readonly(resources),
        update(next: PlayerVitalsResources): void {
            resources.value = copyResources(next)
        },
    }
}

function copyResources(next: PlayerVitalsResources): PlayerVitalsResources {
    const copy: PlayerVitalsResources = {
        hpPercent: next.hpPercent,
        manaPercent: next.manaPercent,
        energyPercent: next.energyPercent,
        ...(next.hpSegments && { hpSegments: [...next.hpSegments] }),
        ...(next.manaSegments && { manaSegments: [...next.manaSegments] }),
        ...(next.energySegments && { energySegments: [...next.energySegments] }),
    }
    for (const kind of playerResourceKinds) {
        const current = next[`${kind}Current`]
        const max = next[`${kind}Max`]
        if (current !== undefined && max !== undefined) {
            copy[`${kind}Current`] = current
            copy[`${kind}Max`] = max
        }
    }
    return copy
}
