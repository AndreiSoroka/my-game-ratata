import type { ScenarioRunSnapshot } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'

/** One final report per helper, addressed only to that assignment's owner. */
export class ScenarioReports {
    private readonly reports = new Map<string, ScenarioRunSnapshot>()

    public record(snapshot: ScenarioRunSnapshot): void {
        if (
            snapshot.ownerId === snapshot.actorId ||
            !['completed', 'stopped'].includes(snapshot.status)
        ) {
            return
        }
        this.reports.set(snapshot.actorId, structuredClone(snapshot))
    }

    public clear(actorId: string): void {
        this.reports.delete(actorId)
    }

    public forOwner(
        ownerId: string,
        actorId: string
    ): ScenarioRunSnapshot | undefined {
        const report = this.reports.get(actorId)
        return report?.ownerId === ownerId ? structuredClone(report) : undefined
    }

    public reconcile(characters: ReadonlyMap<string, GameCharacter>): void {
        for (const [id, report] of this.reports) {
            const actor = characters.get(id)
            const owner = characters.get(report.ownerId)
            if (
                actor === undefined ||
                owner === undefined ||
                actor.tags.has('state.retired') ||
                owner.tags.has('state.retired')
            ) {
                this.reports.delete(id)
            }
        }
    }
}
