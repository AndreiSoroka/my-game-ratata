import {
    FARM_ACTION_COOLDOWN_MS,
    FARM_GROW_MS,
    FARM_HARVEST_GRAIN,
    FARM_INTERACTION_RANGE,
    FARM_PLOTS,
    FARM_SOW_ENERGY,
    type FarmClientMessage,
    type FarmPlotDefinition,
    type FarmPlotSnapshot,
    type GameEventPayload,
} from '@my-game-ratata/contracts'

import type { PlayerAdventure } from './adventureState'
import type { GameCharacter } from './character'
import { addInventoryItems, createItemInstance } from './inventory'
import { distance } from './math'
import { setNotice } from './notices'
import { canPerformSkillAction } from './skillProgression'

export class AdventureFarming {
    private readonly plots: FarmPlotSnapshot[]

    public constructor(
        definitions: readonly FarmPlotDefinition[] = FARM_PLOTS
    ) {
        this.plots = definitions.map(({ initiallyRipe, ...definition }) => ({
            ...structuredClone(definition),
            phase: initiallyRipe === true ? 'ripe' : 'bare',
            readyAt: 0,
        }))
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
        now: number
    ): GameEventPayload[] {
        const plot = this.plots.find(
            (candidate) => candidate.id === message.plotId
        )
        if (!canWork(actor, plot, now)) {
            setNotice(
                state,
                'Для работы подойди к грядке в своей локации: не дальше 48 шагов.'
            )
            return []
        }
        if (now < state.gatherAllowedAt) {
            setNotice(state, 'Подожди немного перед следующей работой.')
            return []
        }
        switch (message.action) {
            case 'sow':
                return sow(actor, state, plot, now)
            case 'harvest':
                return harvest(actor, state, plot, now)
        }
    }
}

function canWork(
    actor: GameCharacter,
    plot: FarmPlotSnapshot | undefined,
    now: number
): plot is FarmPlotSnapshot {
    return (
        canPerformSkillAction(actor, now) &&
        !actor.tags.has('state.retired') &&
        actor.locationId === plot?.locationId &&
        distance(actor.position, plot.position) <= FARM_INTERACTION_RANGE
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
        setNotice(state, 'Эта грядка уже засеяна. Дождись урожая и собери его.')
        return []
    }
    if (actor.energy < FARM_SOW_ENERGY) {
        setNotice(state, 'Для посева нужно 5 сил. Передохни.')
        return []
    }
    actor.drainEnergy(FARM_SOW_ENERGY)
    plot.phase = 'growing'
    plot.readyAt = now + FARM_GROW_MS
    state.gatherAllowedAt = now + FARM_ACTION_COOLDOWN_MS
    setNotice(
        state,
        'Пшеница посеяна. Общинные семена бесплатны; урожай созреет через 45 секунд.'
    )
    return [{ actorId: actor.id, plotId: plot.id, kind: 'farm_sow' }]
}

function harvest(
    actor: GameCharacter,
    state: PlayerAdventure,
    plot: FarmPlotSnapshot,
    now: number
): GameEventPayload[] {
    if (phaseAt(plot, now) !== 'ripe') {
        setNotice(
            state,
            plot.phase === 'bare'
                ? 'Сначала засевай пустую грядку.'
                : 'Пшеница ещё не созрела.'
        )
        return []
    }
    if (
        !addInventoryItems(actor.inventory, [
            createItemInstance('grain', FARM_HARVEST_GRAIN),
        ])
    ) {
        setNotice(
            state,
            'В рюкзаке нет места для всего урожая. Пшеница остаётся на грядке.'
        )
        return []
    }
    plot.phase = 'bare'
    plot.readyAt = 0
    state.gatherAllowedAt = now + FARM_ACTION_COOLDOWN_MS
    setNotice(state, 'Собрано зерно +3. Из него можно испечь хлеб.')
    return [
        {
            actorId: actor.id,
            plotId: plot.id,
            kind: 'farm_harvest',
            amount: FARM_HARVEST_GRAIN,
        },
    ]
}
