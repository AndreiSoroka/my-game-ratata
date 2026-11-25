import {
    type FarmPlotSnapshot,
    type FarmSupplyClientMessage,
    type GameEventPayload,
    getWorldLocationDefinition,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'

import { resolveAdventureNpc } from './adventureNpc'
import type { PlayerAdventure } from './adventureState'
import type { AdventureActionResult } from './adventureTrading'
import type { GameCharacter } from './character'
import type { CityEconomyService } from './cityEconomy'
import { assignedFarmCity, CITY_FARM_SUPPLIERS } from './cityFarmSupplyData'
import { cityTradeRefusal } from './crimeRules'
import { FarmWorkBudgets, type FarmWorkCycle } from './farmWorkBudgets'
import {
    countInventoryItem,
    craftInventoryItems,
    createItemInstance,
} from './inventory'
import { resetMartyrStreak } from './martyr'
import type { NavigationService } from './navigation'
import { setNotice } from './notices'

/** Municipal conversion/subsidy is separate from the finite retail seed stock. */
export class CityFarmSupply {
    private readonly budgets: FarmWorkBudgets
    private readonly trialAdvances = new WeakMap<
        FarmSupplyClientMessage,
        GameCharacter
    >()
    private readonly receipts = new Map<
        string,
        Map<string, { signature: string; result: AdventureActionResult }>
    >()

    public constructor(
        economy: CityEconomyService,
        private readonly farms: (
            locationId: string,
            now: number
        ) => FarmPlotSnapshot[]
    ) {
        this.budgets = new FarmWorkBudgets(economy)
    }

    public readonly remaining = (id: string) => this.budgets.remaining(id)
    public readonly workSchedule = (id: string) => this.budgets.schedule(id)
    public readonly canSupply = (id: string) => this.budgets.canSupply(id)
    public readonly reconcile = (actor: GameCharacter) =>
        this.budgets.reconcile(actor)
    public readonly beginWork = (actor: GameCharacter, now: number) =>
        this.budgets.begin(actor, now)
    public readonly workStatus = (actor: GameCharacter, now: number) =>
        this.budgets.status(actor, now)
    public readonly pauseWork = (
        id: string,
        reason: import('@my-game-ratata/contracts').WorkerActivitySnapshot,
        until: number
    ) => this.budgets.pause(id, reason, until)
    public readonly finishWork = (
        id: string,
        reason?: import('@my-game-ratata/contracts').WorkerActivitySnapshot
    ) => this.budgets.finish(id, reason)
    public readonly observe = (events: readonly GameEventPayload[]) =>
        this.budgets.observe(events)
    public supplierId(actor: GameCharacter): string | undefined {
        const cityId = assignedFarmCity(actor)
        return CITY_FARM_SUPPLIERS.find(
            (supplier) => supplier.cityId === cityId
        )?.npcId
    }
    public forget(id: string): void {
        this.budgets.forget(id)
        this.receipts.delete(id)
    }

    /** The server-owned worker incident grants this exact, synchronous command. */
    public withTrialAdvance(
        actor: GameCharacter,
        message: FarmSupplyClientMessage,
        execute: () => AdventureActionResult
    ): AdventureActionResult {
        this.trialAdvances.set(message, actor)
        try {
            return execute()
        } finally {
            this.trialAdvances.delete(message)
        }
    }

    public handle(
        actor: GameCharacter,
        state: PlayerAdventure,
        message: FarmSupplyClientMessage,
        characters: GameCharacter[],
        navigation: NavigationService | undefined,
        now: number
    ): AdventureActionResult {
        const trial = this.trialAdvances.get(message) === actor
        const signature = JSON.stringify(message)
        const receiptKey = `${trial ? 'trial' : 'work'}:${message.requestId}`
        let receipts = this.receipts.get(actor.id)
        if (receipts === undefined) {
            receipts = new Map()
            this.receipts.set(actor.id, receipts)
        }
        const previous = receipts.get(receiptKey)
        if (previous !== undefined) {
            return previous.signature === signature
                ? { ...previous.result, events: [] }
                : rejected('Этот номер запроса уже использован.')
        }
        const result = this.perform(
            actor,
            message,
            characters,
            navigation,
            now,
            trial
        )
        if (!trial || result.accepted) {
            receipts.set(receiptKey, { signature, result })
        }
        setNotice(
            state,
            result.error ?? 'Город выдал одно семя пшеницы для посева.'
        )
        return result
    }

    private perform(
        actor: GameCharacter,
        message: FarmSupplyClientMessage,
        characters: GameCharacter[],
        navigation: NavigationService | undefined,
        now: number,
        trial: boolean
    ): AdventureActionResult {
        if (!trial) {
            this.reconcile(actor)
        }
        const cityId = assignedFarmCity(actor)
        const cycle = trial ? undefined : this.budgets.get(actor.id)
        if (
            cityId === undefined ||
            (!trial && (cycle === undefined || cycle.remaining <= 0))
        ) {
            return rejected(
                'Семена выдаются только на действующую городскую работу фермера.'
            )
        }
        const refusal = this.supplyRefusal(
            actor,
            cityId,
            message,
            characters,
            navigation,
            now
        )
        if (refusal !== undefined) {
            return rejected(refusal)
        }
        return this.issueSeed(actor, cycle)
    }

    private issueSeed(
        actor: GameCharacter,
        cycle: FarmWorkCycle | undefined
    ): AdventureActionResult {
        if (
            cycle?.outstanding === true ||
            countInventoryItem(actor.inventory, 'wheat_seed') > 0
        ) {
            return rejected('Сначала используй имеющиеся семена для посева.')
        }
        if (cycle?.advances === 0) {
            return rejected(
                'Семена на этот рабочий цикл уже выданы. Вернись после отдыха.'
            )
        }
        const grain = countInventoryItem(actor.inventory, 'grain') > 0 ? 1 : 0
        if (
            !craftInventoryItems(actor.inventory, { grain }, [
                createItemInstance('wheat_seed'),
            ])
        ) {
            return rejected(
                'В рюкзаке нет места для семени. Зерно не потрачено.'
            )
        }
        resetMartyrStreak(actor)
        if (cycle !== undefined) {
            cycle.outstanding = true
            cycle.advances -= 1
        }
        return {
            accepted: true,
            error: null,
            events: [
                {
                    kind: 'item_pickup',
                    actorId: actor.id,
                    itemId: 'wheat_seed',
                },
            ],
        }
    }

    private supplyRefusal(
        actor: GameCharacter,
        cityId: string,
        message: FarmSupplyClientMessage,
        characters: GameCharacter[],
        navigation: NavigationService | undefined,
        now: number
    ): string | undefined {
        const refusal = cityTradeRefusal(actor)
        if (refusal !== undefined) {
            return refusal
        }
        const npc = resolveAdventureNpc(
            actor,
            message.npcId,
            characters,
            now,
            navigation
        )
        if (npc?.locationId !== cityId || npc.id !== this.supplierId(actor)) {
            return 'Подойди к живому городскому поставщику семян.'
        }
        const plot = WORLD_LOCATION_DEFINITIONS.flatMap((location) =>
            isCityFarm(cityId, location.id) ? this.farms(location.id, now) : []
        ).find((candidate) => candidate.id === message.plotId)
        return plot?.phase === 'bare'
            ? undefined
            : 'Выбери свободную грядку городской фермы.'
    }
}

function isCityFarm(cityId: string, farmId: string): boolean {
    const city = getWorldLocationDefinition(cityId)
    const farm = getWorldLocationDefinition(farmId)
    return (
        city !== undefined &&
        farm?.biome === 'outskirts' &&
        Math.abs(city.column - farm.column) + Math.abs(city.row - farm.row) ===
            1
    )
}

function rejected(error: string): AdventureActionResult {
    return { accepted: false, error, events: [] }
}
