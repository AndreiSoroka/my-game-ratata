import type {
    NpcQuestSnapshot,
    QuestHistoryEntry,
    QuestOfferSnapshot,
} from '@my-game-ratata/contracts'

export interface KnownContracts {
    questOffer: QuestOfferSnapshot | null
    issuerQuests: NpcQuestSnapshot[]
    questHistory: QuestHistoryEntry[]
}
/** The journal stays complete on the server; a model receives current contracts and relevant history. */
export function projectContracts(
    value: KnownContracts,
    query: string
): KnownContracts {
    const active = value.issuerQuests.filter((entry) => !terminal(entry.status))
    const historical = relevant(
        value.issuerQuests.filter((entry) => terminal(entry.status)),
        query
    )
    return {
        questOffer: value.questOffer,
        issuerQuests: [...active, ...historical],
        questHistory: relevant(value.questHistory, query),
    }
}
function terminal(status: string): boolean {
    return status === 'completed' || status === 'cancelled'
}
function relevant<T extends { title: string }>(
    entries: T[],
    query: string
): T[] {
    const terms = query.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []
    const matched = entries
        .filter((entry) =>
            terms.some((term) => entry.title.toLocaleLowerCase().includes(term))
        )
        .slice(-6)
    return [...new Set([...matched, ...entries.slice(-6)])]
}
