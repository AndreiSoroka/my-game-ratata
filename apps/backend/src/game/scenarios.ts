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
import {
    pauseScenario,
    releaseScenarioInput,
    resumeScenario,
    stopScenarioControl,
} from './scenarioInput'
import {
    editScenarioLibrary,
    resolveScenarioMarkers,
    type ScenarioLibrary,
    scenarioLibraryFor,
} from './scenarioLibrary'
import { ScenarioPolicies } from './scenarioPolicies'
import { ScenarioReports } from './scenarioReports'
import { advanceScenario } from './scenarioRunner'
import { ScenarioSchedule } from './scenarioSchedule'
import type { ScenarioRunReview, ScenarioRuntime } from './scenarioState'

export interface ScenarioAccess {
    characters(): Iterable<GameCharacter>
    canObserve?(
        owner: GameCharacter,
        actor: GameCharacter,
        now: number
    ): boolean
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
    private readonly schedule = new ScenarioSchedule()
    public constructor(private readonly access: ScenarioAccess) {}
    public registerDefault(
        actor: GameCharacter,
        definition: ScenarioDefinition,
        now: number
    ): void {
        if (definition.main.length === 0 && definition.reactions.length === 0) {
            return
        }
        this.defaults.set(actor.id, structuredClone(definition))
        this.runs.set(
            actor.id,
            this.schedule.create(actor, actor.id, definition, now, true)
        )
    }
    public handle(
        owner: GameCharacter,
        command: AutomationCommand,
        room: GameRoom,
        now: number
    ): string | null {
        if (command.type === 'release_input') {
            return releaseScenarioInput(owner, this.running(owner.id), now)
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
        pauseScenario(actor, this.runs.get(actor.id))
    }
    public running(actorId: string): boolean {
        return this.runs.get(actorId)?.snapshot.status === 'running'
    }
    public busy(actorId: string): boolean {
        const status = this.runs.get(actorId)?.snapshot.status
        return status === 'running' || status === 'paused'
    }
    public ownRunForReview(actorId: string): ScenarioRunReview | undefined {
        const run = this.runs.get(actorId)?.snapshot
        return run?.ownerId === actorId ? run : undefined
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
        this.schedule.observe(actor.id, run)
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
        if (this.busy(actor.id)) {
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
        this.schedule.reconcile(characters)
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
            this.schedule.create(actor, owner.id, resolved, now)
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
            return resumeScenario(actor, run, now)
        } else {
            stopScenarioControl(actor, run)
            run.snapshot.status = 'stopped'
            if (actor !== owner) {
                this.restoreDefault(actor, now)
            }
        }
        return null
    }
    private restoreDefault(actor: GameCharacter, now: number): void {
        const old = this.runs.get(actor.id)
        if (old === undefined) {
            return
        }
        stopScenarioControl(actor, old)
        this.reports.record(old.snapshot, old.definition.main.length)
        if (old.snapshot.ownerId !== actor.id) {
            this.access.release(old.snapshot.ownerId, actor)
        }
        const definition = this.defaults.get(actor.id)
        if (definition === undefined) {
            this.runs.delete(actor.id)
        } else {
            this.runs.set(
                actor.id,
                this.schedule.create(actor, actor.id, definition, now, true)
            )
        }
    }
    private library(id: string): ScenarioLibrary {
        return scenarioLibraryFor(this.libraries, id)
    }
}
