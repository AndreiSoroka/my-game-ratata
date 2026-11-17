import type { QuestHistoryEntry } from '@my-game-ratata/contracts'

/** Authoritative outcomes, separate from fallible conversation summaries and active slots. */
export class QuestJournal {
    private readonly entries: QuestHistoryEntry[] = []
    private readonly issuerIdsByRecipient = new Map<string, Set<string>>()
    private readonly latest = new Map<string, string>()

    public record(entry: QuestHistoryEntry): void {
        const key = `${entry.source}:${entry.id}:${entry.recipientId}`
        const fingerprint = JSON.stringify({
            instanceId: entry.instanceId,
            status: entry.status,
            revision: entry.revision,
            rewardGold: entry.rewardGold,
            receiptId: entry.receiptId,
        })
        if (this.latest.get(key) === fingerprint) {
            return
        }
        this.latest.set(key, fingerprint)
        this.entries.push(structuredClone(entry))
        const issuers =
            this.issuerIdsByRecipient.get(entry.recipientId) ??
            new Set<string>()
        issuers.add(entry.issuerId)
        this.issuerIdsByRecipient.set(entry.recipientId, issuers)
    }

    public conversation(
        issuerId: string,
        recipientId: string
    ): QuestHistoryEntry[] {
        return structuredClone(
            this.entries.filter(
                (entry) =>
                    entry.issuerId === issuerId &&
                    entry.recipientId === recipientId
            )
        )
    }

    public issuerIds(recipientId: string): string[] {
        return [...(this.issuerIdsByRecipient.get(recipientId) ?? [])]
    }

    public forRecipient(recipientId: string): QuestHistoryEntry[] {
        return structuredClone(
            this.entries.filter((entry) => entry.recipientId === recipientId)
        )
    }
}
