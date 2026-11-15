import {
    type CharacterTheftSnapshot,
    type GameEventPayload,
    MASTERY_REWARDS,
    THEFT_RULES,
    type TheftClientMessage,
    type TheftResult,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { JusticeContext } from './cityJustice'
import { constellationModifiers } from './constellationModifiers'
import { CrimeService } from './crime'
import { effectiveTheftCost } from './effectiveParameters'
import {
    canAddInventoryItems,
    type InventoryItemInstance,
    transferInventoryItem,
} from './inventory'
import { distance } from './math'
import { spendUsefulEnergy } from './resourcePractice'
import type { GameRoom } from './room'
import {
    awardMasteries,
    canPerformSkillAction,
    captureMasteryFactors,
} from './skillProgression'
import { privateTheftNotice } from './theftEvents'

interface TheftState {
    availableAt: number
    pairs: Map<string, number>
    lastResult: TheftResult | null
}
export interface TheftContext extends JusticeContext {
    random?: () => number
}

export class TheftService {
    private readonly states = new Map<string, TheftState>()
    private readonly crimes = new CrimeService()

    public handle(
        actor: GameCharacter,
        message: TheftClientMessage,
        context: TheftContext
    ): GameEventPayload[] {
        context = { ...context, characters: [...context.characters] }
        if (message.type === 'report_theft') {
            return this.crimes.report(actor, message.targetId, context)
        }
        if (message.type === 'absolve') {
            return this.crimes.absolve(actor, message.targetId, context)
        }
        if (message.type === 'call_guards') {
            return this.callGuards(actor, message.targetId, context)
        }
        const characters = [...context.characters]
        const target = characters.find(
            (candidate) => candidate.id === message.targetId
        )
        if (!validTarget(actor, target, context)) {
            return [
                privateTheftNotice(
                    actor.id,
                    'Для кражи нужны скрытность, свободные руки и живая цель не дальше 28 шагов.'
                ),
            ]
        }
        const state = this.stateFor(actor.id)
        const unavailable = attemptRestriction(
            actor,
            target,
            state,
            context.now
        )
        if (unavailable !== undefined) {
            return [privateTheftNotice(actor.id, unavailable)]
        }
        const item = stealableItem(target)
        if (item === undefined) {
            return [
                privateTheftNotice(
                    actor.id,
                    'В карманах ничего доступного нет.'
                ),
            ]
        }
        if (!canAddInventoryItems(actor.inventory, [item])) {
            return [
                privateTheftNotice(
                    actor.id,
                    'В твоём рюкзаке нет свободного места.'
                ),
            ]
        }
        return this.resolveAttempt(actor, target, item, state, {
            ...context,
            characters,
        })
    }

    private resolveAttempt(
        actor: GameCharacter,
        target: GameCharacter,
        item: InventoryItemInstance,
        state: TheftState,
        context: TheftContext
    ): GameEventPayload[] {
        const factors = captureMasteryFactors(actor)
        spendUsefulEnergy(actor, effectiveTheftCost(actor))
        state.availableAt =
            context.now +
            THEFT_RULES.cooldownMs -
            constellationModifiers(actor).theftCooldownDiscount
        state.pairs.set(target.id, context.now + THEFT_RULES.pairCooldownMs)
        let outcome = rollTheft(actor, target, context.random ?? Math.random)
        if (
            outcome === 'stolen' &&
            transferInventoryItem(
                target.inventory,
                actor.inventory,
                item.instanceId
            ) === undefined
        ) {
            outcome = 'failed'
        }
        const text =
            outcome === 'caught'
                ? 'Тебя заметили! Кража сорвалась.'
                : outcome === 'stolen'
                  ? 'Предмет незаметно перекочевал в твой рюкзак.'
                  : 'Не удалось достать вещь. Кажется, никто не заметил.'
        state.lastResult = {
            outcome,
            targetId: target.id,
            at: context.now,
            text,
            ...(outcome === 'stolen' ? { itemId: item.itemId } : {}),
        }
        const events = [privateTheftNotice(actor.id, text, target.id)]
        if (outcome === 'stolen') {
            events.push(
                ...awardMasteries(
                    actor,
                    [
                        {
                            constellationId: 'shadow',
                            experience: MASTERY_REWARDS.theftSuccess,
                        },
                    ],
                    {
                        now: context.now,
                        random: context.random,
                        factors,
                        evidence: ['theft', 'stealth'],
                    }
                ).map((event) => ({ ...event, audienceIds: [actor.id] }))
            )
        }
        if (outcome === 'caught') {
            events.push(
                ...this.crimes.record(
                    actor,
                    target,
                    context.characters,
                    context.now
                )
            )
        }
        return events
    }

    private callGuards(
        actor: GameCharacter,
        targetId: string,
        context: TheftContext
    ): GameEventPayload[] {
        return this.crimes.callGuards(
            actor,
            targetId,
            context.characters,
            context.now
        )
    }

    public snapshot(
        actorId: string,
        viewerId: string | undefined,
        now: number
    ): CharacterTheftSnapshot {
        const state = this.states.get(actorId)
        const own = actorId === viewerId
        return {
            cooldownMsLeft: own
                ? Math.max(0, (state?.availableAt ?? 0) - now)
                : 0,
            wantedMsLeft: this.crimes.wantedMsLeft(actorId, now),
            blacklisted: this.crimes.isBlacklisted(actorId),
            lastResult: own ? structuredClone(state?.lastResult ?? null) : null,
            accusations: own
                ? this.crimes.snapshotAccusations(actorId, now)
                : [],
        }
    }

    public update(
        room: GameRoom,
        characters: Iterable<GameCharacter>,
        now: number
    ): Set<string> {
        return this.crimes.update(room, characters, now)
    }

    private stateFor(actorId: string): TheftState {
        const state = this.states.get(actorId) ?? {
            availableAt: 0,
            pairs: new Map<string, number>(),
            lastResult: null,
        }
        this.states.set(actorId, state)
        return state
    }
}

function validTarget(
    actor: GameCharacter,
    target: GameCharacter | undefined,
    context: TheftContext
): target is GameCharacter {
    return (
        canPerformSkillAction(actor, context.now) &&
        actor.movement.mode === 'sneaking' &&
        actor.movement.dashUntil <= context.now &&
        target !== undefined &&
        target.id !== actor.id &&
        target.alive &&
        !target.tags.has('offline') &&
        target.locationId === actor.locationId &&
        distance(actor.position, target.position) <= THEFT_RULES.range &&
        context.navigation.hasLineOfSight(actor.position, target.position)
    )
}
function attemptRestriction(
    actor: GameCharacter,
    target: GameCharacter,
    state: TheftState,
    now: number
): string | undefined {
    if (now < state.availableAt) {
        return 'Нужно перевести дух перед следующей попыткой.'
    }
    if (now < (state.pairs.get(target.id) ?? 0)) {
        return 'Эта цель насторожена. Подожди минуту перед новой попыткой.'
    }
    if (actor.energy < effectiveTheftCost(actor)) {
        return 'Для попытки нужно 10 сил.'
    }
    return undefined
}
function stealableItem(
    target: GameCharacter
): InventoryItemInstance | undefined {
    const equipped = new Set(
        Object.values(target.equipment).map((item) => item.instanceId)
    )
    return target.inventory.find((item) => !equipped.has(item.instanceId))
}
function rollTheft(
    actor: GameCharacter,
    target: GameCharacter,
    random: () => number
): TheftResult['outcome'] {
    const front = facingThief(target, actor)
    const detected = Math.max(0.1, Math.min(0.9, 0.68 + (front ? 0.12 : -0.08)))
    const success = Math.max(
        0.05,
        Math.min(
            0.9,
            0.25 +
                0.04 +
                0.015 +
                (front ? 0 : 0.1) +
                constellationModifiers(actor).theftChanceBonus
        )
    )
    if (random() < detected) {
        return 'caught'
    }
    return random() < success ? 'stolen' : 'failed'
}
function facingThief(target: GameCharacter, actor: GameCharacter): boolean {
    const dx = actor.position.x - target.position.x
    const dy = actor.position.y - target.position.y
    const direction = {
        up: { x: 0, y: -1 },
        down: { x: 0, y: 1 },
        left: { x: -1, y: 0 },
        right: { x: 1, y: 0 },
    }[target.facing]
    return dx * direction.x + dy * direction.y > 0
}
