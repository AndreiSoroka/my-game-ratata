import type {
    AdventureDialogue,
    AgentDecision,
    CharacterSnapshot,
    Vector2,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import { interactionApproachPoints } from '@my-game-ratata/contracts'

import { adventureNpcRoles } from '../game/adventureContent'
import { resolveAdventureNpc } from '../game/adventureNpc'
import type { GameCharacter } from '../game/character'
import { CONVERSATION_REACH } from '../game/conversationSessions'
import { visibleBuildingPoint } from '../game/mapBuildings'
import { distance } from '../game/math'
import type { NavigationService } from '../game/navigation'
import { NPC_OBSERVATION_RADIUS, visibilityRadius } from '../game/queries'
import { observeCity } from './cityObservation'
import { knownGuidePlaces } from './guideTargets'
import { addNpcScenarioObservation } from './npcScenarios'
import { observedCharacterAttack, observedGraves } from './observationCombat'
import { environmentTargets } from './observationEnvironment'
import { buildingTargets, landmarkTargets } from './observationPlaces'
import {
    characterSocialDetails,
    filterNpcAiDialogue,
    filterNpcAiTargets,
    npcAiCapabilities,
    updateNpcAiSocialCapabilities,
} from './observationPolicy'
import type {
    NpcAiObservation,
    NpcAiTarget,
    NpcAiWorld,
} from './observationTypes'
export type {
    NpcAiObservation,
    NpcAiTarget,
    NpcAiWorld,
} from './observationTypes'
import type { NpcAiRole } from './types'

/** A model receives the actor's earned projection, never the debugging snapshot. */
export function buildNpcAiObservation(
    world: NpcAiWorld,
    actor: GameCharacter,
    role: NpcAiRole,
    now: number
): NpcAiObservation {
    const snapshot = world.snapshot(now, actor.locationId, actor.id)
    const navigation = world.navigationFor(actor)
    const buildings = navigation.grid.buildings ?? []
    const visible = (point: Vector2): boolean =>
        distance(actor.position, point) <= NPC_OBSERVATION_RADIUS &&
        visibleBuildingPoint(buildings, actor.position, point) &&
        navigation.hasLineOfSight(actor.position, point)
    const characters = observedCharacters(world, actor, snapshot, visible, now)
    const nearby = [
        ...characters.map((entry) => characterTarget(actor, entry, navigation)),
        ...environmentTargets(snapshot, actor, navigation, visible),
        ...observedGraves(snapshot, actor, role, navigation, visible),
    ]
        .sort(compareTargets)
        .slice(0, 32)
    const dialogue = filterNpcAiDialogue(
        actor,
        role,
        currentDialogue(world, actor, snapshot, navigation, now)
    )
    const targets = filterNpcAiTargets(actor, role, [
        ...nearby,
        ...buildingTargets(buildings, actor),
        ...landmarkTargets(actor, navigation),
    ])
    const observedMerchant =
        dialogue !== null &&
        adventureNpcRoles[dialogue.npcId]?.trade === true &&
        characters.some((entry) => entry.id === dialogue.npcId)
    const observation: NpcAiObservation = {
        knownPlaces: knownGuidePlaces(actor, navigation),
        tick: snapshot.tick,
        serverTime: now,
        locationId: actor.locationId,
        locationName: snapshot.location?.name ?? actor.locationId,
        self: observeSelf(snapshot, actor),
        targets,
        dialogue,
        dialogueCommands:
            dialogue?.choices.map((choice) => ({
                type: 'dialogue_choice',
                choiceId: choice.id,
            })) ?? [],
        ...(observedMerchant && snapshot.adventure?.market !== undefined
            ? {
                  market: snapshot.adventure.market,
                  shop: snapshot.adventure.shop,
              }
            : {}),
        ...observeCity(world, actor, role, now, targets),
        capabilities: npcAiCapabilities(role, targets, dialogue, actor),
    }
    Object.assign(observation, { social: snapshot.social })
    addNpcScenarioObservation(observation, actor, role, snapshot.automation)
    updateNpcAiSocialCapabilities(observation)
    return structuredClone(observation)
}

export function npcAiObservedAttackError(
    world: NpcAiWorld,
    actor: GameCharacter,
    decision: Extract<AgentDecision, { type: 'attack' }>,
    now: number
): string | undefined {
    const target = buildNpcAiObservation(
        world,
        actor,
        'companion',
        now
    ).targets.find((entry) =>
        decision.target !== undefined
            ? entry.kind === 'grave' && entry.id === decision.target.id
            : entry.kind === 'character' && entry.id === decision.targetId
    )
    return target?.commands.some((command) => command.type === 'attack') ===
        true
        ? undefined
        : 'The selected attack target must be visible and in reach'
}

function characterTarget(
    actor: GameCharacter,
    target: CharacterSnapshot,
    navigation: NavigationService
): NpcAiTarget {
    const range = distance(actor.position, target.position)
    const attack = observedCharacterAttack(actor, target, navigation)
    return {
        key: `character:${target.id}`,
        kind: 'character',
        id: target.id,
        name: target.nickname,
        position: { ...target.position },
        distance: range,
        interactionRange: CONVERSATION_REACH,
        commands: [
            ...characterIntentions(actor, target, range),
            ...(attack === undefined ? [] : [attack]),
        ],
        details: {
            controllerKind: target.controllerKind,
            connected: target.connected === true,
            canReceiveQuest:
                target.controllerKind === 'network_player' &&
                target.connected === true,
            spark: target.soul?.kind === 'spark',
            alive: target.alive,
            health: target.health,
            relationship: target.relationship,
            ...characterSocialDetails(actor, target),
            creatureType: target.creatureType,
            canSpeak: target.soul?.canSpeak ?? false,
        },
    }
}

function characterIntentions(
    actor: GameCharacter,
    target: CharacterSnapshot,
    range: number
): AgentDecision[] {
    const commands: AgentDecision[] = [moveTo(target.position)]
    if (
        target.alive &&
        target.relationship === 'hostile' &&
        actor.abilities.known.has('shot')
    ) {
        commands.push({
            type: 'use_ability',
            abilityId: 'shot',
            targetId: target.id,
        })
    }
    if (
        range <= CONVERSATION_REACH &&
        target.alive &&
        target.soul?.canSpeak === true &&
        target.controllerKind !== 'network_player' &&
        target.faction === 'peaceful'
    ) {
        commands.push({ type: 'interact', targetId: target.id })
    }
    return commands
}

function currentDialogue(
    world: NpcAiWorld,
    actor: GameCharacter,
    snapshot: WorldSnapshot,
    navigation: NavigationService,
    now: number
): AdventureDialogue | null {
    const dialogue = snapshot.adventure?.dialogue
    if (dialogue == null || dialogue.kind === 'quest_board') {
        return null
    }
    if (dialogue.kind === 'sign') {
        const sign = snapshot.adventure?.worldObjects?.find(
            (object) => object.id === dialogue.npcId && object.kind === 'sign'
        )
        return sign !== undefined &&
            interactionApproachPoints(
                actor.position,
                sign.interactionAreas ?? [sign.bounds]
            ).some(
                (point) =>
                    distance(actor.position, point) <= CONVERSATION_REACH &&
                    navigation.hasLineOfSight(actor.position, point)
            )
            ? dialogue
            : null
    }
    const npc = world.getCharacter(dialogue.npcId)
    return npc !== undefined &&
        resolveAdventureNpc(actor, dialogue.npcId, [npc], now, navigation) !==
            undefined
        ? dialogue
        : null
}

function moveTo(target: Vector2): AgentDecision {
    return { type: 'move_to', target: { ...target } }
}

function compareTargets(a: NpcAiTarget, b: NpcAiTarget): number {
    const delta = a.distance - b.distance
    return delta !== 0 ? delta : a.key.localeCompare(b.key)
}

function observedCharacters(
    world: NpcAiWorld,
    actor: GameCharacter,
    snapshot: WorldSnapshot,
    visible: (point: Vector2) => boolean,
    now: number
): CharacterSnapshot[] {
    return snapshot.characters.filter((entry) => {
        const target = world.getCharacter(entry.id)
        if (target?.locationId !== actor.locationId || entry.id === actor.id) {
            return false
        }
        return (
            !target.tags.has('offline') &&
            !target.tags.has('state.retired') &&
            distance(actor.position, entry.position) <=
                visibilityRadius(actor, target, NPC_OBSERVATION_RADIUS, now) &&
            visible(entry.position)
        )
    })
}

function observeSelf(
    snapshot: WorldSnapshot,
    actor: GameCharacter
): NpcAiObservation['self'] {
    const own = snapshot.characters.find((entry) => entry.id === actor.id)
    if (own === undefined) {
        throw new Error('NPC observation requires its living identity snapshot')
    }
    return {
        id: own.id,
        nickname: own.nickname,
        position: { ...own.position },
        alive: own.alive,
        health: own.health,
        resources: own.resources,
        inventory: own.inventory,
        equipment: own.equipment,
        ...(own.control === undefined ? {} : { control: own.control }),
        ...(own.abilities === undefined ? {} : { abilities: own.abilities }),
        ...(own.resourceChecks === undefined
            ? {}
            : { resourceChecks: own.resourceChecks }),
        gold: snapshot.adventure?.gold ?? 0,
    }
}
