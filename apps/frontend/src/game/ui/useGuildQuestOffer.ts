import type { ClientMessage, QuestRewardMode, WorldSnapshot } from '@my-game-ratata/contracts'
import { computed, shallowRef, watch } from 'vue'

import { availableGuildContracts } from './guildContractActions'

interface OfferContext {
    available: () => boolean
    playerId: () => string
    snapshot: () => WorldSnapshot
}

interface OfferSelection {
    questId: string
    contactId: string
    playerId: string
    locationId: string | undefined
}

export function useGuildQuestOffer(context: OfferContext) {
    const selected = shallowRef<OfferSelection>()
    const offer = computed(() => {
        const request = selected.value
        if (!request || !context.available()) return undefined
        const snapshot = context.snapshot()
        const contact = snapshot.party?.guildContact
        if (
            request.playerId !== context.playerId() ||
            request.locationId !== snapshot.location?.id ||
            request.contactId !== contact?.npcId
        )
            return undefined

        const job = availableGuildContracts(snapshot, request.playerId).find(
            (candidate) => candidate.id === request.questId
        )
        return job && { job, contact }
    })
    function close(): void {
        selected.value = undefined
    }
    watch(
        offer,
        (current) => {
            if (!current) close()
        },
        { flush: 'sync' }
    )
    function open(questId: string): boolean {
        if (!context.available()) return false
        const snapshot = context.snapshot()
        const contactId = snapshot.party?.guildContact?.npcId
        if (!contactId) return false
        const playerId = context.playerId()
        if (!availableGuildContracts(snapshot, playerId).some((job) => job.id === questId))
            return false
        selected.value = { questId, contactId, playerId, locationId: snapshot.location?.id }
        return true
    }
    function accept(rewardMode: QuestRewardMode): ClientMessage | undefined {
        const job = offer.value?.job
        close()
        return job && { type: 'guild_accept', questId: job.id, rewardMode }
    }
    return { offer, open, close, accept }
}
