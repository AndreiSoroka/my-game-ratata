import type { ItemId, Vector2 } from './index'

export const SCENARIO_MAX_SCENARIOS = 16
export const SCENARIO_MAX_STEPS = 64
export const SCENARIO_PASS_MS = 5_000

export const scenarioAbilityIds = [
    'barrier',
    'blink',
    'dispel_magic',
    'city_portal',
    'defensive_stance',
    'spark',
    'shot',
    'sniper_shot',
    'wide_swing',
    'circular_swing',
    'lunge',
    'pommel_strike',
    'fireball',
    'greater_fireball',
    'chains',
    'pray_grave',
    'ash_exhaustion',
] as const
export type ScenarioAbilityId = (typeof scenarioAbilityIds)[number]
export type ScenarioCombatTarget = 'visible_enemy' | 'reaction_target'
export type ScenarioAbilityTarget = 'self' | ScenarioCombatTarget
const selfAbilities: readonly ScenarioAbilityId[] = [
    'barrier',
    'blink',
    'dispel_magic',
    'city_portal',
    'defensive_stance',
]
export function scenarioAbilityTargets(
    ability: ScenarioAbilityId
): readonly ScenarioAbilityTarget[] {
    if (ability === 'pray_grave') {
        return ['self', 'visible_enemy', 'reaction_target']
    }
    return selfAbilities.includes(ability)
        ? ['self']
        : ['visible_enemy', 'reaction_target']
}

export type ScenarioSearchKind =
    | 'tree'
    | 'stone'
    | 'herbs'
    | 'fiber'
    | 'scrap'
    | 'grain'
    | 'brushwood'
    | 'enemy'
    | 'chest'
    | 'item'
export type ScenarioResourceKind =
    'wood' | 'stone' | 'herbs' | 'fiber' | 'scrap' | 'grain' | 'brushwood'
export interface MarkerDefinition {
    id: string
    number: number
    name: string
    locationId: string
    position: Vector2
}
export type ScenarioDestination =
    | { kind: 'marker'; markerId: string }
    | { kind: 'point'; locationId: string; position: Vector2 }
    | {
          kind: 'visible'
          target: ScenarioSearchKind
          targetId?: string
          locationId?: string
          itemId?: ItemId
      }
export type ScenarioStep = { id: string } & (
    | { kind: 'go'; destination: ScenarioDestination; dash?: boolean }
    | { kind: 'search'; target: ScenarioSearchKind; itemId?: ItemId }
    | {
          kind: 'gather'
          resource: ScenarioResourceKind
          amount: number | 'depleted'
      }
    | { kind: 'attack'; target?: ScenarioCombatTarget }
    | { kind: 'follow'; target: 'nearest_friendly' | 'reaction_target' }
    | {
          kind: 'farm'
          action: 'sow' | 'harvest'
          plotId: string
          locationId: string
      }
    | {
          kind: 'cast'
          abilityId: ScenarioAbilityId
          target: ScenarioAbilityTarget
      }
    | { kind: 'pickup'; itemId?: ItemId }
    | {
          kind: 'deposit'
          chestId?: string
          locationId?: string
          mode: 'all' | 'acquired'
          itemIds: ItemId[]
      }
    | { kind: 'wait'; durationMs: number }
    | { kind: 'recover'; resource: 'energy' | 'mana' | 'hp'; atLeast: number }
)
export type ScenarioTrigger =
    | { kind: 'enemy_visible'; distanceTiles: number }
    | {
          kind: 'friendly_nearby'
          distanceTiles: number
          onlyWhenNotFollowing?: boolean
      }
    | { kind: 'inventory_full' }
    | { kind: 'plot_ripe'; plotId: string; locationId: string }
    | { kind: 'step_result'; stepId: string; status: 'succeeded' | 'failed' }
export interface ScenarioReaction {
    id: string
    trigger: ScenarioTrigger
    sequenceId: string
    delayMs?: number
    notification?: string
}
export interface ScenarioSequence {
    id: string
    name: string
    steps: ScenarioStep[]
}
export interface ScenarioDefinition {
    id: string
    name: string
    main: ScenarioStep[]
    /** null repeats indefinitely; a positive integer is the total pass count. */
    repeat: number | null
    sequences: ScenarioSequence[]
    reactions: ScenarioReaction[]
}
export interface ScenarioStepResult {
    stepId: string
    status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped'
    reason: string | null
    failures: number
}
export interface ScenarioRunSnapshot {
    scenarioId: string
    name: string
    actorId: string
    ownerId: string
    status: 'running' | 'paused' | 'completed' | 'stopped'
    stepIndex: number
    iteration: number
    phase: 'main' | 'reaction' | 'between_passes'
    sequenceId: string | null
    sequenceName: string | null
    reactionId: string | null
    nextPassAt: number | null
    remainingFailureMs: number
    reason: string | null
    interruption: 'conversation' | 'death' | null
    results: ScenarioStepResult[]
}
export interface ScenarioHelperSnapshot {
    actorId: string
    name: string
    eligible: boolean
    reason: string | null
    canFollow: boolean
    run: ScenarioRunSnapshot | null
}
export interface AutomationSnapshot {
    markers: MarkerDefinition[]
    scenarios: ScenarioDefinition[]
    run: ScenarioRunSnapshot | null
    helpers: ScenarioHelperSnapshot[]
}
export type AutomationCommand =
    | { type: 'marker_create'; name?: string }
    | { type: 'marker_rename'; markerId: string; name: string }
    | { type: 'marker_delete'; markerId: string }
    | { type: 'scenario_save'; scenario: ScenarioDefinition }
    | { type: 'scenario_delete'; scenarioId: string }
    | { type: 'scenario_start'; scenarioId: string; targetId?: string }
    | {
          type: 'scenario_pause' | 'scenario_resume' | 'scenario_stop'
          targetId?: string
      }
    | { type: 'release_input' }
