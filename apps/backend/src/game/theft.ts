import {
    type CharacterTheftSnapshot,
    type GameEventPayload,
    THEFT_RULES,
    type TheftClientMessage,
    type TheftResult,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { JusticeContext } from './cityJustice'
import { constellationModifiers } from './constellationModifiers'
import { CrimeService } from './crime'
import type { CrimeOffense } from './crimeEvidence'
import { effectiveTheftCost } from './effectiveParameters'
import { interactionRangeText } from './interactionRangeText'
import {
    canAddInventoryItems,
    type InventoryItemInstance,
    transferInventoryItem,
} from './inventory'
import { resetMartyrStreak } from './martyr'
import { NpcConflictResponses } from './npcConflictResponses'
import { spendUsefulEnergy } from './resourcePractice'
import type { GameRoom } from './room'
import { captureMasteryFactors } from './skillProgression'
import { rollTheft, validTheftTarget } from './theftChecks'
import { privateTheftNotice } from './theftEvents'
import { practiceTheft } from './theftPractice'

interface TheftState {
    availableAt: number
    pairs: Map<string, number>
    lastResult: TheftResult | null
}
export interface TheftContext extends JusticeContext {
    random?: () => number
}

export class TheftService {
    public onCaught?: (
        thief: GameCharacter,
        victim: GameCharacter,
        context: TheftContext
    ) => GameEventPayload[] | undefined
    public reconsider?: (
        now: number,
        busy: (actor: GameCharacter) => boolean
    ) => void
    public onAbsolved?: (offender: GameCharacter) => void

    private readonly states = new Map<string, TheftState>()
    private readonly crimes = new CrimeService()
    public readonly reactions = new NpcConflictResponses()

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
            return this.crimes.absolve(actor, message.targetId, context, () => {
                this.reactions.clearRelatedCrimes(actor)
                this.onAbsolved?.(actor)
            })
        }
        if (message.type === 'call_guards') {
            return this.callGuards(actor, message.targetId, context)
        }
        const characters = [...context.characters]
        const target = characters.find(
            (candidate) => candidate.id === message.targetId
        )
        if (!validTheftTarget(actor, target, context)) {
            return [
                privateTheftNotice(
                    actor.id,
                    `Для кражи нужны скрытность, свободные руки и живая цель ${interactionRangeText(THEFT_RULES.range, context.navigation.grid.tileWidth)}.`
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
        const rolledOutcome = rollTheft(
            actor,
            target,
            context.random ?? Math.random,
            context.now
        )
        let outcome = rolledOutcome
        if (
            outcome === 'stolen' &&
            transferInventoryItem(
                target.inventory,
                actor.inventory,
                item.instanceId,
                undefined,
                true
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
            resetMartyrStreak(actor)
        }
        if (outcome === rolledOutcome && outcome !== 'caught') {
            events.push(
                ...practiceTheft(actor, target, outcome, {
                    now: context.now,
                    random: context.random,
                    factors,
                })
            )
        }
        if (outcome === 'caught') {
            events.push(
                ...this.crimes.record(
                    actor,
                    target,
                    context.characters,
                    context.now,
                    () => this.onCaught?.(actor, target, context)
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
        now: number,
        actor?: GameCharacter
    ): CharacterTheftSnapshot {
        const state = this.states.get(actorId)
        const own = actorId === viewerId
        return {
            ...(own && actor !== undefined
                ? { energyCost: effectiveTheftCost(actor) }
                : {}),
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
        const all = [...characters]
        const controlled = this.crimes.update(room, all, now)
        this.reconsider?.(
            now,
            (actor) =>
                controlled.has(actor.id) ||
                room.social.exchanges.isPaused(actor.id)
        )
        this.reactions.update(
            room,
            all,
            now,
            controlled,
            (actor, targetId, context, offense) =>
                this.crimes.report(actor, targetId, context, offense)
        )
        return controlled
    }

    public recordAssault(
        attacker: GameCharacter,
        victim: GameCharacter,
        now: number
    ): void {
        this.crimes.recordAssault(attacker, victim, now)
    }

    public reportExpiry(
        witnessId: string,
        offenderId: string,
        offense: CrimeOffense
    ): number | undefined {
        return this.crimes.reportExpiry(witnessId, offenderId, offense)
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
    const cost = effectiveTheftCost(actor)
    if (actor.energy < cost) {
        return `Для попытки нужно ${String(cost)} сил.`
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
