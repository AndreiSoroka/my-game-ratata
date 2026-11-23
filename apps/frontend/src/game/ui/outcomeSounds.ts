import type {
    CharacterSnapshot,
    ConstellationId,
    ExchangeSnapshot,
    MasterySnapshot,
    WorldSnapshot,
} from '@my-game-ratata/contracts'

import type { UiSoundId } from '../assets/soundCatalog'
import { createConstellationNotices } from './constellationNotices'

export function createOutcomeSounds() {
    const constellations = createConstellationNotices()
    const levels = new Map<ConstellationId, number>()
    const questReceipts = new Set<string>()
    const exchangeReceipts = new Set<string>()
    let session: string | undefined
    let lastTick = 0
    let activeExchangeId: string | undefined

    function observeMasteries(masteries: readonly MasterySnapshot[] = []): boolean {
        let increased = false
        for (const { id, level } of masteries) {
            const previous = levels.get(id)
            if (previous !== undefined && level > previous) increased = true
            levels.set(id, level)
        }
        return increased
    }

    function observeExchange(exchange: ExchangeSnapshot | null | undefined): boolean {
        if (exchange === undefined) return false
        const previous = activeExchangeId
        activeExchangeId = exchange?.status === 'active' ? exchange.id : undefined
        return (
            exchange?.status === 'completed' &&
            recordReceipt(exchangeReceipts, exchange.receiptId) &&
            previous === exchange.id
        )
    }

    return {
        observe(snapshot: WorldSnapshot, playerId: string | undefined) {
            const player = snapshot.characters.find((actor) => actor.id === playerId)
            if (player === undefined) return undefined

            const nextSession = JSON.stringify([snapshot.serverEpoch, playerId])
            const initial = session !== nextSession
            if (initial) {
                session = nextSession
                levels.clear()
                questReceipts.clear()
                exchangeReceipts.clear()
                activeExchangeId = undefined
            } else if (snapshot.tick <= lastTick) return undefined
            lastTick = snapshot.tick

            const masteryIncreased = observeMasteries(player.progression?.masteries)
            const questCompleted = recordReceipt(
                questReceipts,
                snapshot.adventure?.lastQuestRewardReceiptId
            )
            const exchangeCompleted = observeExchange(snapshot.social?.exchange)
            const constellationNotice = constellations.observe(snapshot, playerId)
            const confirmed =
                questCompleted || exchangeCompleted || constellationNotice !== undefined
            const sound = selectOutcomeSound(player, initial, masteryIncreased, confirmed)
            return { constellationNotice, sound }
        },
    }
}

function recordReceipt(seen: Set<string>, receipt: string | undefined): boolean {
    if (receipt === undefined || seen.has(receipt)) return false
    seen.add(receipt)
    return true
}

function selectOutcomeSound(
    player: CharacterSnapshot,
    initial: boolean,
    masteryIncreased: boolean,
    confirmed: boolean
): UiSoundId | undefined {
    if (initial || !player.alive || player.life?.retired === true) return undefined
    if (masteryIncreased) return 'masteryUp'
    return confirmed ? 'uiConfirmation' : undefined
}
