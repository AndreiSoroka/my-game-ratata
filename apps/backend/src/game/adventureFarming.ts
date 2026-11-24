import {
    authoredMessage,
    FARM_ACTION_COOLDOWN_MS,
    FARM_GROW_MS,
    FARM_HARVEST_GRAIN,
    FARM_HARVEST_SEED_DROPS,
    FARM_INTERACTION_RANGE,
    FARM_PLOTS,
    FARM_SOW_ENERGY,
    FARM_SOW_SEEDS,
    type FarmClientMessage,
    type FarmPlotDefinition,
    type FarmPlotSnapshot,
    type GameEventPayload,
} from '@my-game-ratata/contracts'

import type { PlayerAdventure } from './adventureState'
import type { GameCharacter } from './character'
import { effectiveWorkEnergy } from './effectiveParameters'
import { interactionRangeText } from './interactionRangeText'
import {
    addInventoryItems,
    consumeInventoryItems,
    createItemInstance,
} from './inventory'
import { resetMartyrStreak } from './martyr'
import { distance } from './math'
import type { NavigationService } from './navigation'
import { setAuthoredNotice, setNotice } from './notices'
import { recordLifeWorkSpend } from './resourcePractice'
import { canPerformSkillAction } from './skillProgression'
import { withWorldSound } from './worldSound'

export class AdventureFarming {
    private readonly plots: FarmPlotSnapshot[]
    private readonly seedYields = new Map<string, number>()

    public constructor(
        definitions: readonly FarmPlotDefinition[] = FARM_PLOTS,
        private readonly random: () => number = Math.random
    ) {
        this.plots = definitions.map(({ initiallyRipe, ...definition }) => ({
            ...structuredClone(definition),
            phase: initiallyRipe === true ? 'ripe' : 'bare',
            readyAt: 0,
        }))
        for (const plot of this.plots) {
            if (plot.phase === 'ripe') {
                this.seedYields.set(plot.id, rollHarvestSeeds(this.random))
            }
        }
    }

    public snapshot(locationId: string, now: number): FarmPlotSnapshot[] {
        return this.plots
            .filter((plot) => plot.locationId === locationId)
            .map((plot) => ({
                ...structuredClone(plot),
                phase: phaseAt(plot, now),
            }))
    }

    public act(
        actor: GameCharacter,
        state: PlayerAdventure,
        message: FarmClientMessage,
        now: number,
        navigation?: NavigationService
    ): GameEventPayload[] {
        const plot = this.plots.find(
            (candidate) => candidate.id === message.plotId
        )
        if (!canWork(actor, plot, now, navigation)) {
            setNotice(
                state,
                `Для работы нужна грядка ${interactionRangeText(FARM_INTERACTION_RANGE, navigation?.grid.tileWidth)} в твоей локации.`,
                authoredMessage('farm.nearby')
            )
            return []
        }
        if (now < state.gatherAllowedAt) {
            setAuthoredNotice(state, 'notice.waitToWork')
            return []
        }
        switch (message.action) {
            case 'sow': {
                const events = sow(actor, state, plot, now)
                if (events.length > 0) {
                    this.seedYields.set(plot.id, rollHarvestSeeds(this.random))
                }
                return events
            }
            case 'harvest': {
                const events = harvest(
                    actor,
                    state,
                    plot,
                    now,
                    this.seedYields.get(plot.id) ?? 0
                )
                if (events.length > 0) {
                    this.seedYields.delete(plot.id)
                }
                return events
            }
        }
    }
}

function canWork(
    actor: GameCharacter,
    plot: FarmPlotSnapshot | undefined,
    now: number,
    navigation?: NavigationService
): plot is FarmPlotSnapshot {
    return (
        canPerformSkillAction(actor, now) &&
        !actor.tags.has('state.retired') &&
        actor.locationId === plot?.locationId &&
        distance(actor.position, plot.position) <= FARM_INTERACTION_RANGE &&
        (navigation === undefined ||
            navigation.hasLineOfSight(actor.position, plot.position))
    )
}

function phaseAt(
    plot: FarmPlotSnapshot,
    now: number
): FarmPlotSnapshot['phase'] {
    return plot.phase === 'growing' && now >= plot.readyAt ? 'ripe' : plot.phase
}

function sow(
    actor: GameCharacter,
    state: PlayerAdventure,
    plot: FarmPlotSnapshot,
    now: number
): GameEventPayload[] {
    if (phaseAt(plot, now) !== 'bare') {
        setAuthoredNotice(state, 'notice.plotAlreadySown')
        return []
    }
    const energy = effectiveWorkEnergy(actor, FARM_SOW_ENERGY)
    if (actor.energy < energy) {
        setAuthoredNotice(state, 'notice.farmEnergy', { energy })
        return []
    }
    if (
        !consumeInventoryItems(actor.inventory, { wheat_seed: FARM_SOW_SEEDS })
    ) {
        setAuthoredNotice(state, 'farm.seedRequired')
        return []
    }
    recordLifeWorkSpend(actor, actor.drainEnergy(energy), now)
    resetMartyrStreak(actor)
    plot.phase = 'growing'
    plot.readyAt = now + FARM_GROW_MS
    state.gatherAllowedAt = now + FARM_ACTION_COOLDOWN_MS
    setAuthoredNotice(state, 'farm.sown', { energy })
    return [{ actorId: actor.id, plotId: plot.id, kind: 'farm_sow' }]
}

function harvest(
    actor: GameCharacter,
    state: PlayerAdventure,
    plot: FarmPlotSnapshot,
    now: number,
    seedQuantity: number
): GameEventPayload[] {
    if (phaseAt(plot, now) !== 'ripe') {
        setAuthoredNotice(
            state,
            plot.phase === 'bare' ? 'farm.sowFirst' : 'farm.notRipe'
        )
        return []
    }
    const items = [createItemInstance('grain', FARM_HARVEST_GRAIN)]
    if (seedQuantity > 0) {
        items.push(createItemInstance('wheat_seed', seedQuantity))
    }
    if (!addInventoryItems(actor.inventory, items)) {
        setAuthoredNotice(state, 'farm.noSpace')
        return []
    }
    resetMartyrStreak(actor)
    plot.phase = 'bare'
    plot.readyAt = 0
    state.gatherAllowedAt = now + FARM_ACTION_COOLDOWN_MS
    if (seedQuantity === 0) {
        setAuthoredNotice(state, 'farm.harvest')
    } else {
        setAuthoredNotice(state, 'farm.harvestWithSeeds', {
            seeds: seedQuantity,
        })
    }
    return [
        withWorldSound(
            {
                actorId: actor.id,
                plotId: plot.id,
                kind: 'farm_harvest',
                amount: FARM_HARVEST_GRAIN,
            },
            'harvest',
            plot.locationId,
            plot.position
        ),
    ]
}

function rollHarvestSeeds(random: () => number): number {
    const roll = random() * 100
    let boundary = 0
    for (const drop of FARM_HARVEST_SEED_DROPS) {
        boundary += drop.weight
        if (roll < boundary) {
            return drop.quantity
        }
    }
    return 0
}
