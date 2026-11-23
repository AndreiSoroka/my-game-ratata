import type { GameLocale, Vector2 } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { hasDirectRetaliationRight } from './crimeRelations'
import { canTargetByFaction, isPveOpponent } from './factions'
import { distance } from './math'
import type { NavigationService } from './navigation'
import {
    hasGroupHostility,
    hasPersonalHostility,
    isLivingHuman,
    setGroupHostility,
} from './personalHostility'
import { cancelPrayerCast } from './prayerCancellation'
import type { GameRoom } from './room'
import {
    advanceSavvaVisits,
    canSeeSavvaVisitor,
    savvaEntryTiles,
    savvaGroupThreshold,
    savvaTrespassCause,
    type SavvaVisits,
    withinSavvaTerritory,
} from './savvaTerritoryVisits'
import { canConverseWithNpc } from './socialSpeech'
import { createSpeechEvent } from './speechReceipts'

export const SAVVA_ID = 'npc_necromancer_1'
const leashTiles = 8
const persuasionRange = 48
const persuasionCooldownMs = 15_000
const ceasefire: Record<GameLocale, string> = {
    ru: 'Ладно. Оставим вражду.',
    en: 'Enough. I will stand down.',
}

interface PersuasionResult {
    roll: number
    success: boolean
}

interface PersuasionReceipt {
    episode: number
    messageId: string
    result: PersuasionResult
}

interface Territory extends SavvaVisits {
    episode: number
    threat: GameCharacter | undefined
    nextPersuasionAt: number
    receipts: WeakMap<GameCharacter, PersuasionReceipt>
}

const territories = new WeakMap<GameCharacter, Territory>()

export function registerSavvaTerritory(savva: GameCharacter, home: Vector2) {
    territories.set(savva, {
        home,
        visits: new Map(),
        violations: 0,
        episode: 0,
        threat: undefined,
        nextPersuasionAt: 0,
        receipts: new WeakMap(),
    })
}

export function advanceSavvaTerritory(room: GameRoom, now: number): void {
    const savva = room.getCharacter(SAVVA_ID)
    if (savva === undefined) {
        return
    }
    const territory = territories.get(savva)
    if (territory === undefined || !savva.alive || savva.tags.has('offline')) {
        return
    }
    const navigation = room.navigationFor(savva)
    const neighbors = room.charactersFor(savva)
    if (
        territory.violations < savvaGroupThreshold &&
        advanceSavvaVisits(savva, territory, room, neighbors, navigation, now)
    ) {
        territory.episode += 1
        territory.nextPersuasionAt = now
        territory.visits.clear()
        setGroupHostility(savva, 'living_humans', true)
    }
    updateThreat(savva, territory, room, neighbors, navigation, now)
}

function updateThreat(
    savva: GameCharacter,
    territory: Territory,
    room: GameRoom,
    neighbors: readonly GameCharacter[],
    navigation: NavigationService,
    now: number
): void {
    const current = territory.threat
    const inReach = (visitor: GameCharacter, tiles: number) =>
        (hasGroupHostility(savva, visitor) ||
            hasPersonalHostility(savva, visitor, now, savvaTrespassCause)) &&
        withinSavvaTerritory(territory.home, visitor, navigation, tiles) &&
        canSeeSavvaVisitor(savva, visitor, navigation, now)
    if (current !== undefined && inReach(current, leashTiles)) {
        return
    }
    const next = neighbors
        .filter((visitor) => inReach(visitor, savvaEntryTiles))
        .sort((left, right) => {
            const nearest =
                distance(savva.position, left.position) -
                distance(savva.position, right.position)
            return nearest === 0 ? left.id.localeCompare(right.id) : nearest
        })[0]
    territory.threat = next
    if (current !== undefined && current !== next) {
        savva.clearPath()
        if (!independentThreat(savva, current, now)) {
            if (savva.pendingAttack?.targetId === current.id) {
                savva.clearPendingAttackHit()
            }
            const cast = savva.abilities.casting
            if (
                cast?.targetId === current.id &&
                cast.mode === 'prayer' &&
                cast.intent.mode === 'harm'
            ) {
                room.publishEvents(cancelPrayerCast(savva, now))
            }
        }
    }
}

function independentThreat(
    savva: GameCharacter,
    visitor: GameCharacter,
    now: number
): boolean {
    return (
        isPveOpponent(savva, visitor) ||
        hasDirectRetaliationRight(savva, visitor, now) ||
        (hasPersonalHostility(savva, visitor, now) &&
            !hasPersonalHostility(savva, visitor, now, savvaTrespassCause))
    )
}

export function savvaTerritorialTarget(savva: GameCharacter) {
    return territories.get(savva)?.threat
}

export function isNecromancerThreat(
    savva: GameCharacter,
    visitor: GameCharacter,
    now: number
): boolean {
    const territory = territories.get(savva)
    return territory === undefined
        ? canTargetByFaction(savva, visitor, now)
        : territory.threat === visitor || independentThreat(savva, visitor, now)
}

export function savvaHumanTrust(
    savva: GameCharacter,
    speaker: GameCharacter
): number {
    return isLivingHuman(speaker)
        ? 0 - (territories.get(savva)?.violations ?? 0) * 20
        : 0
}

export function savvaPersuasionContext(
    savva: GameCharacter,
    speaker: GameCharacter,
    room: GameRoom,
    now: number
): { episode: number } | undefined {
    const territory = territories.get(savva)
    if (
        territory === undefined ||
        territory.violations < savvaGroupThreshold ||
        territory.threat === undefined ||
        !hasGroupHostility(savva, territory.threat) ||
        now < territory.nextPersuasionAt ||
        territory.receipts.get(speaker)?.episode === territory.episode
    ) {
        return undefined
    }
    const navigation = room.navigationFor(savva)
    return canSeeSavvaVisitor(savva, territory.threat, navigation, now) &&
        withinSavvaTerritory(
            territory.home,
            territory.threat,
            navigation,
            leashTiles
        ) &&
        canConverseWithNpc(savva, speaker, navigation, now, persuasionRange)
        ? { episode: territory.episode }
        : undefined
}

export function attemptSavvaPersuasion(
    savva: GameCharacter,
    speaker: GameCharacter,
    room: GameRoom,
    now: number,
    episode: number,
    messageId: string,
    random = Math.random
): PersuasionResult | undefined {
    const territory = territories.get(savva)
    if (territory === undefined) {
        return undefined
    }
    const receipt = territory.receipts.get(speaker)
    if (receipt?.episode === episode && receipt.messageId === messageId) {
        return receipt.result
    }
    if (
        savvaPersuasionContext(savva, speaker, room, now)?.episode !== episode
    ) {
        return undefined
    }
    const roll = Math.floor(random() * 20) + 1
    const result = { roll, success: roll >= 15 }
    territory.receipts.set(speaker, { episode, messageId, result })
    territory.nextPersuasionAt = now + persuasionCooldownMs
    if (result.success) {
        territory.violations = 0
        setGroupHostility(savva, 'living_humans', false)
        updateThreat(
            savva,
            territory,
            room,
            room.charactersFor(savva),
            room.navigationFor(savva),
            now
        )
        const language = room.localeFor(speaker.id)
        room.publishEvents([
            {
                ...createSpeechEvent(savva, ceasefire[language]),
                channel: 'say',
                language,
            },
        ])
    }
    return result
}
