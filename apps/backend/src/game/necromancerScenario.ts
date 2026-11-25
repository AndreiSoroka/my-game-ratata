import {
    ABILITY_DEFINITIONS,
    SCENARIO_PASS_MS,
    type ScenarioAbilityId,
    scenarioAbilityTargets,
    type ScenarioDefinition,
    type ScenarioStep,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { distance } from './math'
import { approachStudyLandmark } from './necromancerActions'
import type { NecromancerOffer } from './necromancerPlanning'
import type {
    NecromancerLandmark,
    NecromancerScenarioEdit,
    NecromancerScene,
} from './necromancerTactics'
import type { GameRoom } from './room'
import { advanceScenario } from './scenarioRunner'
import {
    createScenarioRun,
    type ScenarioRuntime,
    startScenarioReaction,
} from './scenarioState'

export const necromancerOpeningAbilities = [
    'barrier',
    'dispel_magic',
    'spark',
    'shot',
    'fireball',
    'greater_fireball',
    'chains',
    'pray_grave',
    'ash_exhaustion',
] as const satisfies readonly ScenarioAbilityId[]

/** Savva's shared scenario steps run only when his tactical controller yields. */
export class NecromancerScenario {
    public readonly visited = new Map<string, string | undefined>()
    public nextRestAt = -Infinity
    private pending:
        { edit: NecromancerScenarioEdit; offer: NecromancerOffer } | undefined
    private opening: Extract<
        NecromancerScenarioEdit,
        { kind: 'set_opening' }
    > | null = null
    private restRun: ScenarioRuntime | undefined
    private combatRun: ScenarioRuntime | undefined
    private nextCombatAt = -Infinity

    public constructor(private readonly home: Vector2) {}

    public observe(actor: GameCharacter) {
        return {
            name: this.definition(actor).name,
            opening: this.opening,
            availableAbilities: necromancerOpeningAbilities.filter((id) =>
                actor.abilities.known.has(id)
            ),
        }
    }

    private edit(actor: GameCharacter, edit: NecromancerScenarioEdit): void {
        if (edit.kind === 'clear_opening') {
            this.opening = null
            return
        }
        if (
            !Number.isInteger(edit.distanceCells) ||
            edit.distanceCells < 1 ||
            edit.distanceCells > 8 ||
            (edit.abilityId !== null &&
                !this.observe(actor).availableAbilities.some(
                    (id) => id === edit.abilityId
                ))
        ) {
            return
        }
        this.opening = { ...edit }
    }

    public queueEdit(
        edit: NecromancerScenarioEdit,
        offer: NecromancerOffer
    ): void {
        this.pending = { edit, offer }
    }

    public discardPending(): void {
        this.pending = undefined
    }

    public applyPending(
        actor: GameCharacter,
        scene: NecromancerScene,
        now: number
    ): void {
        if (scene.threat === undefined) {
            this.quiet()
        }
        const pending = this.pending
        if (pending === undefined) {
            return
        }
        const { edit, offer } = pending
        if (
            actor.deathSequence !== offer.deathSequence ||
            actor.locationId !== offer.locationId ||
            now > offer.startedAt + 45_000 ||
            (offer.context.phase === 'combat') !== (scene.threat !== undefined)
        ) {
            this.pending = undefined
        } else if (this.combatRun === undefined) {
            this.edit(actor, edit)
            this.pending = undefined
        }
    }

    public study(
        actor: GameCharacter,
        room: GameRoom,
        landmarks: readonly NecromancerLandmark[],
        now: number
    ): boolean {
        if (now < this.nextRestAt) {
            return false
        }
        const next = landmarks.find(({ id }) => !this.visited.has(id))
        if (next !== undefined) {
            if (!approachStudyLandmark(actor, room, next, now)) {
                return false
            }
            this.visited.set(next.id, next.ashClue)
            return true
        }
        if (this.rest(actor, room, now)) {
            return false
        }
        this.nextRestAt = now + 30_000
        return true
    }

    private rest(actor: GameCharacter, room: GameRoom, now: number): boolean {
        if (actor.locationId !== actor.spawnLocationId) {
            return false
        }
        this.restRun ??= createScenarioRun(
            actor,
            actor.id,
            { ...this.definition(actor), reactions: [] },
            now,
            true
        )
        advanceScenario(actor, this.restRun, room, now, false)
        if (this.restRun.snapshot.phase !== 'between_passes') {
            return true
        }
        this.restRun = undefined
        return false
    }

    public combat(
        actor: GameCharacter,
        room: GameRoom,
        threat: GameCharacter,
        now: number
    ): boolean {
        const run =
            this.combatRun ?? this.startOpening(actor, room, threat, now)
        if (run === undefined) {
            return false
        }
        if (run.reaction?.targetId !== threat.id) {
            this.combatRun = undefined
            return false
        }
        this.combatRun = run
        advanceScenario(actor, run, room, now, false)
        const handled = run.snapshot.reason === null || actor.hasPath()
        if (run.snapshot.phase !== 'reaction' || !handled) {
            this.combatRun = undefined
        }
        return handled
    }

    public quiet(): void {
        this.combatRun = undefined
    }

    private startOpening(
        actor: GameCharacter,
        room: GameRoom,
        threat: GameCharacter,
        now: number
    ): ScenarioRuntime | undefined {
        const opening = this.opening
        if (
            opening === null ||
            now < this.nextCombatAt ||
            actor.locationId !== actor.spawnLocationId
        ) {
            return undefined
        }
        const range = distance(actor.position, threat.position)
        const tileWidth = room.navigationFor(actor).grid.tileWidth
        if (
            range > opening.distanceCells * tileWidth ||
            !this.openingInReach(threat, range) ||
            (opening.abilityId !== null &&
                (actor.abilities.availableAt[opening.abilityId] ?? 0) > now)
        ) {
            return undefined
        }
        const definition = this.definition(actor)
        const reaction = definition.reactions[0]
        const sequence = definition.sequences[0]
        if (reaction === undefined || sequence === undefined) {
            return undefined
        }
        this.nextCombatAt = now + SCENARIO_PASS_MS
        this.restRun = undefined
        const run = createScenarioRun(
            actor,
            actor.id,
            { ...definition, main: [], reactions: [] },
            now,
            true
        )
        startScenarioReaction(
            actor,
            run,
            { sequence, targetId: threat.id },
            reaction.id
        )
        return run
    }

    private openingInReach(threat: GameCharacter, range: number): boolean {
        const id = this.opening?.abilityId
        return id == null
            ? distance(this.home, threat.position) > range
            : targetsSelf(id) || range <= ABILITY_DEFINITIONS[id].range
    }

    private definition(actor: GameCharacter): ScenarioDefinition {
        const home: ScenarioStep = {
            id: 'refuge',
            kind: 'go',
            destination: {
                kind: 'point',
                locationId: actor.spawnLocationId,
                position: this.home,
            },
        }
        const definition: ScenarioDefinition = {
            id: `refuge-${actor.id}`,
            name: 'Дозор пепельного убежища',
            main: [home, { id: 'rest', kind: 'wait', durationMs: 500 }],
            repeat: 1,
            sequences: [],
            reactions: [],
        }
        if (this.opening !== null) {
            const { abilityId, distanceCells } = this.opening
            const step: ScenarioStep =
                abilityId === null
                    ? { ...home, id: 'opening-retreat' }
                    : {
                          id: 'opening-cast',
                          kind: 'cast',
                          abilityId,
                          target: targetsSelf(abilityId)
                              ? 'self'
                              : 'reaction_target',
                      }
            definition.sequences.push({
                id: 'opening',
                name: 'Действие при угрозе',
                steps: [step],
            })
            definition.reactions.push({
                id: 'threat',
                sequenceId: 'opening',
                trigger: {
                    kind: 'enemy_visible',
                    distanceTiles: distanceCells,
                },
            })
        }
        return definition
    }
}

function targetsSelf(abilityId: ScenarioAbilityId): boolean {
    return (
        abilityId !== 'pray_grave' &&
        scenarioAbilityTargets(abilityId).includes('self')
    )
}
