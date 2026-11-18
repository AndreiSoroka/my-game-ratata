import type {
    AutomationCommand,
    AutomationSnapshot,
    ScenarioDefinition,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { cancelCharacterControl } from './characterControl'
import type { CharacterController } from './controllers'
import type { GameRoom } from './room'
import { scenarioHelpers } from './scenarioHelpers'
import { releaseScenarioInput } from './scenarioInput'
import {
    editScenarioLibrary,
    resolveScenarioMarkers,
    type ScenarioLibrary,
    scenarioLibraryFor,
} from './scenarioLibrary'
import { ScenarioPolicies } from './scenarioPolicies'
import { ScenarioReports } from './scenarioReports'
import { advanceScenario } from './scenarioRunner'
import { createScenarioRun, type ScenarioRuntime } from './scenarioState'

export interface ScenarioAccess {
    characters(): Iterable<GameCharacter>
    canAssign(
        owner: GameCharacter,
        actor: GameCharacter,
        now: number
    ): { accepted: boolean; error: string | null }
    claim(
        owner: GameCharacter,
        actor: GameCharacter,
        now: number
    ): { accepted: boolean; error: string | null }
    hasConsent(ownerId: string, actor: GameCharacter): boolean
    release(ownerId: string, actor: GameCharacter): void
    capabilities(actor: GameCharacter): {
        canFight: boolean
        canFollow: boolean
    }
}
export class ScenarioService {
    private readonly policies = new ScenarioPolicies()
    private readonly reports = new ScenarioReports()
    private readonly libraries = new Map<string, ScenarioLibrary>()
    private readonly runs = new Map<string, ScenarioRuntime>()
    private readonly defaults = new Map<string, ScenarioDefinition>()
    public constructor(private readonly access: ScenarioAccess) {}
    public registerDefault(
        actor: GameCharacter,
        definition: ScenarioDefinition,
        now: number
    ): void {
        if (definition.steps.length === 0) {
            return
        }
        this.defaults.set(actor.id, structuredClone(definition))
        this.runs.set(
            actor.id,
            createScenarioRun(actor, actor.id, definition, now, true)
        )
    }
    public handle(
        owner: GameCharacter,
        command: AutomationCommand,
        room: GameRoom,
        now: number
    ): string | null {
        if (command.type === 'release_input') {
            return this.releaseInput(owner)
        }
        if (!owner.alive || owner.tags.has('state.retired')) {
            return 'Персонаж сейчас недоступен.'
        }
        if (command.type === 'scenario_start') {
            return this.start(
                owner,
                command.scenarioId,
                command.targetId,
                room,
                now
            )
        }
        if (
            command.type === 'scenario_pause' ||
            command.type === 'scenario_resume' ||
            command.type === 'scenario_stop'
        ) {
            return this.control(owner, command, room, now)
        }
        return editScenarioLibrary(owner, this.library(owner.id), command)
    }
    public pause(actor: GameCharacter): void {
        const run = this.runs.get(actor.id)
        if (run?.snapshot.status !== 'running') {
            return
        }
        run.snapshot.status = 'paused'
        actor.clearPath()
        actor.setMoveInput({ x: 0, y: 0 })
    }
    public running(actorId: string): boolean {
        return this.runs.get(actorId)?.snapshot.status === 'running'
    }
    public busy(actorId: string): boolean {
        return ['running', 'paused'].includes(
            this.runs.get(actorId)?.snapshot.status ?? ''
        )
    }
    public advance(
        actor: GameCharacter,
        room: GameRoom,
        now: number,
        held: boolean
    ): boolean {
        const run = this.runs.get(actor.id)
        if (run === undefined) {
            return false
        }
        const owner = room.getCharacter(run.snapshot.ownerId)
        if (
            !run.builtin &&
            actor.id !== run.snapshot.ownerId &&
            (owner === undefined || !this.access.hasConsent(owner.id, actor))
        ) {
            this.restoreDefault(actor, now)
            return false
        }
        const handled = advanceScenario(actor, run, room, now, held)
        if (
            run.snapshot.status === 'completed' &&
            actor.id !== run.snapshot.ownerId
        ) {
            this.restoreDefault(actor, now)
        }
        return handled
    }
    public defer(actorId: string, now: number): void {
        const run = this.runs.get(actorId)
        if (run !== undefined) {
            run.lastAt = now
        }
    }
    public advancePolicy(
        actor: GameCharacter,
        controller: CharacterController,
        room: GameRoom,
        now: number
    ): boolean {
        const status = this.runs.get(actor.id)?.snapshot.status
        if (status === 'running' || status === 'paused') {
            return false
        }
        return this.policies.advance(actor, controller, room, now)
    }
    public reconcile(
        characters: ReadonlyMap<string, GameCharacter>,
        now: number
    ): void {
        this.policies.reconcile(characters)
        this.reports.reconcile(characters)
        for (const id of this.libraries.keys()) {
            if (!characters.has(id)) {
                this.libraries.delete(id)
            }
        }
        for (const [id, run] of this.runs) {
            const actor = characters.get(id)
            if (actor === undefined) {
                this.runs.delete(id)
                this.defaults.delete(id)
            } else if (!characters.has(run.snapshot.ownerId)) {
                this.restoreDefault(actor, now)
            }
        }
    }
    public snapshot(owner: GameCharacter, now: number): AutomationSnapshot {
        const library = this.library(owner.id)
        return structuredClone({
            markers: library.markers,
            scenarios: library.scenarios,
            run: this.runs.get(owner.id)?.snapshot ?? null,
            helpers: scenarioHelpers(
                this.access,
                this.runs,
                owner,
                now,
                this.reports
            ),
        })
    }
    private start(
        owner: GameCharacter,
        scenarioId: string,
        targetId: string | undefined,
        room: GameRoom,
        now: number
    ): string | null {
        const library = this.library(owner.id)
        const definition = library.scenarios.find(
            (entry) => entry.id === scenarioId
        )
        const actor =
            targetId === undefined ? owner : room.getCharacter(targetId)
        if (definition === undefined || actor === undefined) {
            return 'Сценарий или исполнитель не найден.'
        }
        const resolved = resolveScenarioMarkers(definition, library)
        if (resolved === undefined) {
            return 'Используемая метка удалена. Обнови сценарий.'
        }
        if (actor !== owner) {
            const permission = this.access.claim(owner, actor, now)
            if (!permission.accepted) {
                return permission.error
            }
        }
        cancelCharacterControl(actor)
        this.reports.clear(actor.id)
        actor.clearPath()
        actor.setMoveInput({ x: 0, y: 0 })
        this.runs.set(
            actor.id,
            createScenarioRun(actor, owner.id, resolved, now)
        )
        return null
    }
    private control(
        owner: GameCharacter,
        command: Extract<
            AutomationCommand,
            { type: 'scenario_pause' | 'scenario_resume' | 'scenario_stop' }
        >,
        room: GameRoom,
        now: number
    ): string | null {
        const actor =
            command.targetId === undefined
                ? owner
                : room.getCharacter(command.targetId)
        if (actor === undefined) {
            return 'Исполнитель не найден.'
        }
        const run = this.runs.get(actor.id)
        if (
            run?.snapshot.ownerId !== owner.id ||
            (actor !== owner && !this.access.hasConsent(owner.id, actor))
        ) {
            return 'У тебя нет действующего поручения этому персонажу.'
        }
        if (command.type === 'scenario_pause') {
            this.pause(actor)
        } else if (command.type === 'scenario_resume') {
            if (run.snapshot.status !== 'paused') {
                return 'Этот сценарий не приостановлен.'
            }
            cancelCharacterControl(actor)
            run.snapshot.status = 'running'
            run.lastAt = now
            run.step.previousDistance = Infinity
            run.step.lastPlanAt = -Infinity
        } else {
            actor.clearPath()
            actor.setMoveInput({ x: 0, y: 0 })
            run.snapshot.status = 'stopped'
            if (actor !== owner) {
                this.restoreDefault(actor, now)
            }
        }
        return null
    }
    private restoreDefault(actor: GameCharacter, now: number): void {
        const old = this.runs.get(actor.id)
        if (old !== undefined) {
            this.reports.record(old.snapshot)
        }
        if (old !== undefined && old.snapshot.ownerId !== actor.id) {
            this.access.release(old.snapshot.ownerId, actor)
        }
        actor.clearPath()
        actor.setMoveInput({ x: 0, y: 0 })
        const definition = this.defaults.get(actor.id)
        if (definition === undefined) {
            this.runs.delete(actor.id)
        } else {
            this.runs.set(
                actor.id,
                createScenarioRun(actor, actor.id, definition, now, true)
            )
        }
    }
    private releaseInput(actor: GameCharacter): null {
        return releaseScenarioInput(actor, this.running(actor.id))
    }
    private library(id: string): ScenarioLibrary {
        return scenarioLibraryFor(this.libraries, id)
    }
}
