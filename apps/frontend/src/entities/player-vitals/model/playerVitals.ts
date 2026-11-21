import { readonly, shallowRef } from 'vue'

export const playerResourceKinds = ['hp', 'mana', 'energy'] as const

export interface ResourceNumbers {
    readonly current: number
    readonly max: number
}

export interface PlayerVitalsResources {
    hpPercent: number
    manaPercent: number
    energyPercent: number
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
