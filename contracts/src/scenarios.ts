import type { ItemId, Vector2 } from './index'

export type ScenarioSearchKind =
    | 'tree'
    | 'stone'
    | 'herbs'
    | 'fiber'
    | 'scrap'
    | 'grain'
    | 'enemy'
    | 'chest'
    | 'item'
export type ScenarioResourceKind =
    'wood' | 'stone' | 'herbs' | 'fiber' | 'scrap' | 'grain'
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
    | { kind: 'go'; destination: ScenarioDestination }
    | { kind: 'search'; target: ScenarioSearchKind; itemId?: ItemId }
    | {
          kind: 'gather'
          resource: ScenarioResourceKind
          amount: number | 'depleted'
      }
    | { kind: 'attack' }
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
export interface ScenarioDefinition {
    id: string
    name: string
    steps: ScenarioStep[]
    /** null repeats indefinitely; a positive integer is the total pass count. */
    repeat: number | null
    threat: 'continue' | 'attack' | 'flee'
}
export interface ScenarioStepResult {
    stepId: string
    status: 'pending' | 'running' | 'succeeded' | 'failed'
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
    remainingFailureMs: number
    reason: string | null
    interruption: 'enemy' | 'conversation' | 'death' | null
    results: ScenarioStepResult[]
}
export interface ScenarioHelperSnapshot {
    actorId: string
    name: string
    eligible: boolean
    reason: string | null
    canFight: boolean
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
