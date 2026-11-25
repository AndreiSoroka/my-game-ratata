import {
    SCENARIO_PASS_MS,
    type ScenarioDefinition,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { createScenarioRun, type ScenarioRuntime } from './scenarioState'

/** Admission is scoped to the actor, so replacing a run cannot reset its cadence. */
export class ScenarioSchedule {
    private readonly lastPassStarts = new Map<string, number>()

    public create(
        actor: GameCharacter,
        ownerId: string,
        definition: ScenarioDefinition,
        now: number,
        builtin = false
    ): ScenarioRuntime {
        const nextPassAt =
            (this.lastPassStarts.get(actor.id) ?? -Infinity) + SCENARIO_PASS_MS
        const run = createScenarioRun(
            actor,
            ownerId,
            definition,
            now,
            builtin,
            nextPassAt
        )
        this.observe(actor.id, run)
        return run
    }

    public observe(actorId: string, run: ScenarioRuntime): void {
        if (
            run.passStartedAt !== undefined &&
            run.passStartedAt !== this.lastPassStarts.get(actorId)
        ) {
            this.lastPassStarts.set(actorId, run.passStartedAt)
        }
    }

    public reconcile(characters: ReadonlyMap<string, GameCharacter>): void {
        for (const id of this.lastPassStarts.keys()) {
            if (!characters.has(id)) {
                this.lastPassStarts.delete(id)
            }
        }
    }
}
