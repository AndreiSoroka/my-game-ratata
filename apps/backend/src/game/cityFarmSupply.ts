import {
    FARM_HARVEST_GRAIN,
    FARM_WORK_CYCLE_MS,
    FARM_WORK_GRAIN,
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
import { CITY_FARM_SUPPLIERS } from './cityFarmSupplyData'
import { cityTradeRefusal } from './crimeRules'
import {
    countInventoryItem,
    craftInventoryItems,
    createItemInstance,
} from './inventory'
import type { NavigationService } from './navigation'
import { setNotice } from './notices'
import { canPerformSkillAction } from './skillProgression'

interface FarmWorkCycle {
    remaining: number
    nextAt: number
    outstanding: boolean
    advances: number
}

/** Municipal conversion/subsidy is separate from the finite retail seed stock. */
export class CityFarmSupply {
    private readonly cycles = new Map<string, FarmWorkCycle>()
    private readonly receipts = new Map<
        string,
        Map<string, { signature: string; result: AdventureActionResult }>
    >()

    public constructor(
        private readonly economy: CityEconomyService,
        private readonly farms: (
            locationId: string,
            now: number
        ) => FarmPlotSnapshot[]
    ) {}

    public remaining(actorId: string): number {
        return this.cycles.get(actorId)?.remaining ?? 0
    }

    public canSupply(actorId: string): boolean {
        const cycle = this.cycles.get(actorId)
        return (
            cycle !== undefined &&
            cycle.remaining > 0 &&
            !cycle.outstanding &&
            cycle.advances > 0
        )
    }

    public supplierId(actor: GameCharacter): string | undefined {
        const cityId = assignedCity(actor)
        return CITY_FARM_SUPPLIERS.find(
            (supplier) => supplier.cityId === cityId
        )?.npcId
    }

    public reconcile(actor: GameCharacter): void {
        const cycle = this.cycles.get(actor.id)
        if (
            cycle?.outstanding === true &&
            countInventoryItem(actor.inventory, 'wheat_seed') === 0
        ) {
            // A lost advance cannot be replaced until the original work budget renews.
            cycle.remaining = 0
        }
    }

    public beginWork(actor: GameCharacter, now: number): boolean {
        this.reconcile(actor)
        const cityId = assignedCity(actor)
        if (
            cityId === undefined ||
            !canPerformSkillAction(actor, now) ||
            actor.tags.has('state.retired')
        ) {
            return false
        }
        const previous = this.cycles.get(actor.id)
        if (previous !== undefined && previous.remaining > 0) {
            return true
        }
        if (previous !== undefined && now < previous.nextAt) {
            return false
        }
        const grain = this.economy
            .snapshot(cityId, now)
            ?.rows.find((row) => row.itemId === 'grain')
        if (grain === undefined || grain.stock >= grain.target) {
            return false
        }
        this.cycles.set(actor.id, {
            remaining: FARM_WORK_GRAIN,
            nextAt: now + FARM_WORK_CYCLE_MS,
            outstanding: false,
            advances: Math.ceil(FARM_WORK_GRAIN / FARM_HARVEST_GRAIN),
        })
        return true
    }

    public finishWork(actorId: string): void {
        const cycle = this.cycles.get(actorId)
        if (cycle !== undefined) {
            cycle.remaining = 0
        }
    }

    public observe(events: readonly GameEventPayload[]): void {
        for (const event of events) {
            const cycle =
                event.actorId === undefined
                    ? undefined
                    : this.cycles.get(event.actorId)
            if (cycle === undefined) {
                continue
            }
            if (event.kind === 'farm_sow') {
                cycle.outstanding = false
            }
            if (event.kind === 'farm_harvest') {
                cycle.remaining = Math.max(
                    0,
                    cycle.remaining - (event.amount ?? 0)
                )
            }
        }
    }

    public forget(actorId: string): void {
        this.cycles.delete(actorId)
        this.receipts.delete(actorId)
    }

    public handle(
        actor: GameCharacter,
        state: PlayerAdventure,
        message: FarmSupplyClientMessage,
        characters: GameCharacter[],
        navigation: NavigationService | undefined,
        now: number
    ): AdventureActionResult {
        const signature = JSON.stringify(message)
        let receipts = this.receipts.get(actor.id)
        if (receipts === undefined) {
            receipts = new Map()
            this.receipts.set(actor.id, receipts)
        }
        const previous = receipts.get(message.requestId)
        if (previous !== undefined) {
            return previous.signature === signature
                ? { ...previous.result, events: [] }
                : rejected('Этот номер запроса уже использован.')
        }
        const result = this.perform(actor, message, characters, navigation, now)
        receipts.set(message.requestId, { signature, result })
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
        now: number
    ): AdventureActionResult {
        this.reconcile(actor)
        const cityId = assignedCity(actor)
        const cycle = this.cycles.get(actor.id)
        if (
            cityId === undefined ||
            cycle === undefined ||
            cycle.remaining <= 0
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
        if (
            cycle.outstanding ||
            countInventoryItem(actor.inventory, 'wheat_seed') > 0
        ) {
            return rejected('Сначала используй имеющиеся семена для посева.')
        }
        if (cycle.advances === 0) {
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
        cycle.outstanding = true
        cycle.advances -= 1
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

function assignedCity(actor: GameCharacter): string | undefined {
    return actor.tags.has('worker.farmer')
        ? WORLD_LOCATION_DEFINITIONS.find(
              (location) =>
                  location.biome === 'city' &&
                  actor.tags.has(`worker.city.${location.id}`)
          )?.id
        : undefined
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
