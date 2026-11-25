import {
    type AutomationSnapshot,
    buildScenarioFromTemplate,
    type ConfigureScenarioDecision,
    scenarioAbilityIds,
    scenarioAbilityTargets,
    type ScenarioStep,
    scenarioTemplates,
    validateScenarioDefinition,
} from '@my-game-ratata/contracts'

import type { AgentDecisionResult } from '../game/agentDecisions'
import type { GameCharacter } from '../game/character'
import type { GameRoom } from '../game/room'
import { buildNpcAiObservation } from './observation'
import type { NpcAiObservation, NpcAiTarget } from './observationTypes'
import type { NpcAiActorState } from './runtimeState'
import type { NpcAiRole } from './types'

function canConfigure(actor: GameCharacter, role: NpcAiRole): boolean {
    return (
        role === 'companion' &&
        actor.controllerKind !== 'network_player' &&
        actor.soul.controlSource !== 'human' &&
        actor.alive &&
        !actor.tags.has('offline') &&
        !actor.tags.has('state.retired')
    )
}

export function observeNpcScenarios(
    actor: GameCharacter,
    role: NpcAiRole,
    targets: readonly NpcAiTarget[],
    automation: AutomationSnapshot | undefined
) {
    if (!canConfigure(actor, role) || automation === undefined) {
        return undefined
    }
    const run = automation.run
    return {
        templates: scenarioTemplates.map(
            ({ id, description, requirements }) => ({
                id,
                description: description.ru,
                requirements: requirements.ru,
            })
        ),
        markers: [
            ...automation.markers.map(({ id, name, locationId }) => ({
                id,
                name,
                locationId,
            })),
            ...localBindings(actor, targets).map(({ id, name }) => ({
                id,
                name,
                locationId: actor.locationId,
            })),
        ],
        plots: targets
            .filter(({ kind }) => kind === 'farm')
            .map(({ id, name }) => ({
                id,
                name,
                locationId: actor.locationId,
            })),
        abilities: scenarioAbilityIds.filter(
            (id) =>
                actor.abilities.known.has(id) &&
                scenarioAbilityTargets(id).includes('self')
        ),
        saved: automation.scenarios.map(({ id, name }) => ({ id, name })),
        run:
            run?.ownerId === actor.id
                ? {
                      scenarioId: run.scenarioId,
                      status: run.status,
                      phase: run.phase,
                      reason: run.reason,
                      results: run.results.map(
                          ({ stepId, status, reason }) => ({
                              stepId,
                              status,
                              reason,
                          })
                      ),
                  }
                : null,
    }
}

export function addNpcScenarioObservation(
    observation: NpcAiObservation,
    actor: GameCharacter,
    role: NpcAiRole,
    automation: AutomationSnapshot | undefined
): void {
    const scenarios = observeNpcScenarios(
        actor,
        role,
        observation.targets,
        automation
    )
    if (scenarios !== undefined) {
        observation.scenarios = scenarios
        observation.capabilities?.intentions.push('configure_scenario')
    }
}

function localBindings(actor: GameCharacter, targets: readonly NpcAiTarget[]) {
    return [
        { id: 'here', name: 'Текущее место', position: actor.position },
        ...targets
            .filter(({ kind }) =>
                ['building', 'landmark', 'resource', 'chest', 'farm'].includes(
                    kind
                )
            )
            .map(({ key, name, position }) => ({ id: key, name, position })),
    ]
}

export function prepareNpcScenario(
    room: GameRoom,
    actor: GameCharacter,
    role: NpcAiRole,
    decision: ConfigureScenarioDecision,
    now: number
) {
    if (
        !canConfigure(actor, role) ||
        actor.soul.companion?.leaderId != null ||
        room.social.exchanges.isPaused(actor.id)
    ) {
        return { error: 'Сейчас нельзя настраивать собственные сценарии.' }
    }
    if (
        decision.start &&
        (actor.abilities.casting !== null || actor.isActionLocked(now))
    ) {
        return { error: 'Новый сценарий можно начать после текущего действия.' }
    }
    const automation = room.scenarios.snapshot(actor, now)
    const active = automation.run
    if (
        active !== null &&
        active.ownerId !== actor.id &&
        (active.status === 'running' || active.status === 'paused')
    ) {
        return { error: 'Сейчас у меня есть принятое поручение.' }
    }
    const observation = buildNpcAiObservation(room, actor, role, now)
    return compileNpcScenario(actor, observation, automation, decision)
}

function compileNpcScenario(
    actor: GameCharacter,
    observation: NpcAiObservation,
    automation: AutomationSnapshot,
    decision: ConfigureScenarioDecision
) {
    const options = observation.scenarios
    if (options === undefined) {
        return { error: 'Мои настройки сценариев сейчас недоступны.' }
    }
    const { plotId, plotLocationId, abilityId } = decision.parameters
    if (
        decision.templateId === 'farmer' &&
        !options.plots.some(
            (plot) => plot.id === plotId && plot.locationId === plotLocationId
        )
    ) {
        return { error: 'Выбери грядку из доступного наблюдения.' }
    }
    if (abilityId !== undefined && !options.abilities.includes(abilityId)) {
        return { error: 'Выбери освоенное защитное умение.' }
    }
    const template = scenarioTemplates.find(
        ({ id }) => id === decision.templateId
    )
    if (template === undefined) {
        return { error: 'Выбери доступный шаблон сценария.' }
    }
    const scenario = buildScenarioFromTemplate(
        template.id,
        `npc-template-${template.id}`,
        template.name.ru,
        decision.parameters
    )
    const destinations = localBindings(actor, observation.targets)
    const bind = (step: ScenarioStep): ScenarioStep => {
        if (step.kind !== 'go' || step.destination.kind !== 'marker') {
            return step
        }
        const id = step.destination.markerId
        const point = destinations.find((entry) => entry.id === id)
        return point === undefined
            ? step
            : {
                  ...step,
                  destination: {
                      kind: 'point',
                      locationId: actor.locationId,
                      position: { ...point.position },
                  },
              }
    }
    scenario.main = scenario.main.map(bind)
    for (const sequence of scenario.sequences) {
        sequence.steps = sequence.steps.map(bind)
    }
    const validated = validateScenarioDefinition(scenario, {
        markers: automation.markers,
    })
    return validated.ok
        ? { scenario: validated.scenario }
        : { error: `Проверь параметры шаблона. ${validated.message}` }
}

export function configureNpcScenario(
    room: GameRoom,
    actor: GameCharacter,
    role: NpcAiRole,
    decision: ConfigureScenarioDecision,
    now: number
): AgentDecisionResult {
    const prepared = prepareNpcScenario(room, actor, role, decision, now)
    if (prepared.scenario === undefined) {
        return { accepted: false, error: prepared.error, events: [] }
    }
    const saved = room.requestAutomation(
        actor,
        { type: 'scenario_save', scenario: prepared.scenario },
        now
    )
    return saved.accepted && decision.start
        ? room.requestAutomation(
              actor,
              { type: 'scenario_start', scenarioId: prepared.scenario.id },
              now
          )
        : saved
}

export function npcScenarioConfigurationProblem(
    room: GameRoom,
    actor: GameCharacter,
    state: NpcAiActorState,
    decision: ConfigureScenarioDecision,
    now: number
): string | undefined {
    if (
        state.task?.requesterId != null ||
        state.guide !== undefined ||
        state.pending !== undefined
    ) {
        return 'Сначала закончи уже начатое дело.'
    }
    return prepareNpcScenario(room, actor, state.config.role, decision, now)
        .error
}
