import type { ScenarioRunSnapshot } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'

/** One final report per helper, addressed only to that assignment's owner. */
export class ScenarioReports {
    private readonly reports = new Map<
        string,
        { run: ScenarioRunSnapshot; mainLength: number }
    >()

    public record(
        snapshot: ScenarioRunSnapshot,
        mainLength = snapshot.results.length
    ): void {
        if (
            snapshot.ownerId === snapshot.actorId ||
            !['completed', 'stopped'].includes(snapshot.status)
        ) {
            return
        }
        this.reports.set(snapshot.actorId, {
            run: structuredClone(snapshot),
            mainLength,
        })
    }

    public clear(actorId: string): void {
        this.reports.delete(actorId)
    }

    public forOwner(
        ownerId: string,
        actorId: string,
        canObserve = () => true
    ): ScenarioRunSnapshot | undefined {
        const report = this.reports.get(actorId)
        if (report?.run.ownerId !== ownerId) {
            return undefined
        }
        return structuredClone(
            canObserve()
                ? report.run
                : hideScenarioReaction(report.run, report.mainLength)
        )
    }

    public reconcile(characters: ReadonlyMap<string, GameCharacter>): void {
        for (const [id, { run: report }] of this.reports) {
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

export function hideScenarioReaction(
    run: ScenarioRunSnapshot,
    mainLength: number
): ScenarioRunSnapshot {
    if (run.results.length <= mainLength) {
        return run
    }
    return {
        ...run,
        stepIndex: Math.min(run.stepIndex, Math.max(0, mainLength - 1)),
        sequenceId: null,
        sequenceName: null,
        reactionId: null,
        remainingFailureMs: 0,
        reason: null,
        results: run.results.slice(0, mainLength),
    }
}
