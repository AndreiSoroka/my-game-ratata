import {
    type CharacterSnapshot,
    type DeityMood,
    PRAYER_SCHOOL_DEFINITIONS,
    prayerAbilityForDeity,
    type SoulSnapshot,
} from '@my-game-ratata/contracts'
import { readonly, shallowRef } from 'vue'

export const playerResourceKinds = ['hp', 'mana', 'energy'] as const

export interface ResourceNumbers {
    readonly current: number
    readonly max: number
}

export interface PlayerStatusResources {
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

interface PlayerStatusDetails {
    nickname: string
    soulKind?: SoulSnapshot['kind'] | undefined
    isCanSpeak?: boolean | undefined
    patronName?: string | undefined
    patronMasteryName?: string | undefined
    patronMasteryLevel?: number | undefined
    patronMood?: DeityMood | undefined
}

export interface PlayerStatusData extends PlayerStatusDetails, PlayerStatusResources {}

export interface PlayerStatusViewProps extends PlayerStatusData {
    hpAnimated?: boolean
    manaAnimated?: boolean
    energyAnimated?: boolean
    dimSecondaryResources?: boolean
}

export function projectPlayerStatusDetails({
    nickname,
    soul,
    progression,
    abilities,
}: Pick<
    CharacterSnapshot,
    'nickname' | 'soul' | 'progression' | 'abilities'
>): PlayerStatusDetails {
    return {
        nickname,
        soulKind: soul?.kind,
        isCanSpeak: soul?.canSpeak,
        ...projectPatronDetails(progression, abilities),
    }
}

function projectPatronDetails(
    progression: CharacterSnapshot['progression'],
    abilities: CharacterSnapshot['abilities']
) {
    const patron = progression?.deity
    if (!patron) return {}

    const prayer = prayerAbilityForDeity(patron.id)
    if (!abilities?.known.includes(prayer)) return {}

    const mastery = progression.masteries.find(
        (entry) => entry.id === PRAYER_SCHOOL_DEFINITIONS[prayer].constellationId
    )
    return {
        patronName: patron.name,
        patronMasteryName: mastery?.name,
        patronMasteryLevel: mastery?.level,
        patronMood: patron.mood ?? undefined,
    }
}

export function createPlayerStatusStore(initial: PlayerStatusResources) {
    const resources = shallowRef(copyResources(initial))

    return {
        resources: readonly(resources),
        update(next: PlayerStatusResources): void {
            resources.value = copyResources(next)
        },
    }
}

function copyResources(next: PlayerStatusResources): PlayerStatusResources {
    const copy: PlayerStatusResources = {
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
