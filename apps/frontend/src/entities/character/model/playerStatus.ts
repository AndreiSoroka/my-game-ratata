import {
    type CharacterSnapshot,
    type DeityId,
    type DeityMood,
    PRAYER_SCHOOL_DEFINITIONS,
    prayerAbilityForDeity,
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

export interface PatronStatusEntry {
    id: DeityId
    name: string
    level?: number | undefined
    mood?: DeityMood | undefined
}

interface PlayerStatusDetails {
    nickname: string
    patrons?: readonly PatronStatusEntry[] | undefined
}

export interface PlayerStatusData extends PlayerStatusDetails, PlayerStatusResources {}

export interface PlayerStatusViewProps extends PlayerStatusData {
    compact?: boolean
    hpAnimated?: boolean
    manaAnimated?: boolean
    energyAnimated?: boolean
    dimSecondaryResources?: boolean
}

export function projectPlayerStatusDetails({
    nickname,
    progression,
    abilities,
}: Pick<CharacterSnapshot, 'nickname' | 'progression' | 'abilities'>): PlayerStatusDetails {
    const patron = projectPrimaryPatron(progression, abilities)
    return {
        nickname,
        patrons: patron ? [patron] : [],
    }
}

function projectPrimaryPatron(
    progression: CharacterSnapshot['progression'],
    abilities: CharacterSnapshot['abilities']
): PatronStatusEntry | undefined {
    const patron = progression?.deity
    if (!patron) return undefined

    const prayer = prayerAbilityForDeity(patron.id)
    if (!abilities?.known.includes(prayer)) return undefined

    const mastery = progression.masteries.find(
        (entry) => entry.id === PRAYER_SCHOOL_DEFINITIONS[prayer].constellationId
    )
    return {
        id: patron.id,
        name: patron.name,
        level: mastery?.level,
        mood: patron.mood ?? undefined,
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
