import {
    FARM_HARVEST_GRAIN,
    FARM_WORK_CYCLE_MS,
    FARM_WORK_GRAIN,
    type GameEventPayload,
    type WorkerActivitySnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { CityEconomyService } from './cityEconomy'
import { assignedFarmCity } from './cityFarmSupplyData'
import { countInventoryItem } from './inventory'
import { canPerformSkillAction } from './skillProgression'

export interface FarmWorkCycle {
    remaining: number
    nextAt: number
    outstanding: boolean
    advances: number
    stop?: WorkerActivitySnapshot
}

export class FarmWorkBudgets {
    private readonly cycles = new Map<string, FarmWorkCycle>()
    public constructor(private readonly economy: CityEconomyService) {}
    public get(id: string) {
        return this.cycles.get(id)
    }
    public remaining(id: string): number {
        return this.get(id)?.remaining ?? 0
    }
    public schedule(id: string) {
        const cycle = this.get(id)
        return {
            remaining: cycle?.remaining ?? 0,
            nextAt: cycle?.nextAt ?? 0,
            ...(cycle?.stop === undefined
                ? {}
                : { stop: structuredClone(cycle.stop) }),
        }
    }
    public canSupply(id: string): boolean {
        const cycle = this.get(id)
        return (
            cycle !== undefined &&
            cycle.remaining > 0 &&
            !cycle.outstanding &&
            cycle.advances > 0
        )
    }
    public reconcile(actor: GameCharacter): void {
        const cycle = this.get(actor.id)
        if (
            cycle?.outstanding === true &&
            countInventoryItem(actor.inventory, 'wheat_seed') === 0
        ) {
            this.finish(actor.id, {
                reason: 'seeds',
                text: 'Выданный аванс семян утрачен. Новый аванс доступен в следующем рабочем цикле.',
                intent: 'wait',
                until: cycle.nextAt,
            })
        }
    }
    public begin(actor: GameCharacter, now: number): boolean {
        this.reconcile(actor)
        if (this.status(actor, now) !== undefined) {
            return false
        }
        if (this.remaining(actor.id) > 0) {
            const cycle = this.get(actor.id)
            if (cycle !== undefined) {
                delete cycle.stop
            }
            return true
        }
        this.cycles.set(actor.id, {
            remaining: FARM_WORK_GRAIN,
            nextAt: now + FARM_WORK_CYCLE_MS,
            outstanding: false,
            advances: Math.ceil(FARM_WORK_GRAIN / FARM_HARVEST_GRAIN),
        })
        return true
    }
    public status(
        actor: GameCharacter,
        now: number
    ): WorkerActivitySnapshot | undefined {
        const cityId = assignedFarmCity(actor)
        if (cityId === undefined || !canPerformSkillAction(actor, now)) {
            return {
                reason: 'unavailable',
                text: 'Сейчас обычная фермерская работа недоступна состоянию или назначению персонажа.',
                intent: 'wait',
            }
        }
        const cycle = this.get(actor.id)
        const blocked = this.cycleStatus(cycle, now)
        if (blocked !== undefined) {
            return blocked
        }
        if (cycle !== undefined && cycle.remaining > 0) {
            return undefined
        }
        const grain = this.economy
            .snapshot(cityId, now)
            ?.rows.find((row) => row.itemId === 'grain')
        if (grain === undefined) {
            return {
                reason: 'unavailable',
                text: 'Нет доступного городского реестра запасов для фермерской работы.',
                intent: 'wait',
            }
        }
        return grain.stock >= grain.target
            ? {
                  reason: 'stock_sufficient',
                  text: 'Зерна на городском складе достаточно для текущей нормы; новый выход пока не нужен.',
                  intent: 'wait',
              }
            : undefined
    }
    private cycleStatus(
        cycle: FarmWorkCycle | undefined,
        now: number
    ): WorkerActivitySnapshot | undefined {
        if (cycle?.stop?.until !== undefined && now < cycle.stop.until) {
            return structuredClone(cycle.stop)
        }
        if (cycle?.remaining === 0 && now < cycle.nextAt) {
            return structuredClone(
                cycle.stop ?? {
                    reason: 'break',
                    text: 'Рабочий лимит на этот цикл исчерпан; жду следующего цикла.',
                    intent: 'wait',
                    until: cycle.nextAt,
                }
            )
        }
        return undefined
    }
    public finish(id: string, reason?: WorkerActivitySnapshot): void {
        const cycle = this.get(id)
        if (cycle !== undefined) {
            cycle.remaining = 0
            cycle.stop =
                reason === undefined
                    ? {
                          reason: 'break',
                          text: 'Рабочий выход завершён; новый лимит доступен в следующем цикле.',
                          intent: 'wait',
                          until: cycle.nextAt,
                      }
                    : { ...reason, until: reason.until ?? cycle.nextAt }
        }
    }
    public pause(
        id: string,
        reason: WorkerActivitySnapshot,
        until: number
    ): void {
        const cycle = this.get(id)
        if (cycle !== undefined) {
            cycle.stop = { ...reason, until }
        }
    }
    public observe(events: readonly GameEventPayload[]): void {
        for (const event of events) {
            const cycle =
                event.actorId === undefined
                    ? undefined
                    : this.get(event.actorId)
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
                if (cycle.remaining === 0) {
                    cycle.stop = {
                        reason: 'break',
                        text: 'Рабочая норма урожая выполнена; жду следующего рабочего цикла.',
                        intent: 'wait',
                        until: cycle.nextAt,
                    }
                }
            }
        }
    }
    public forget(id: string): void {
        this.cycles.delete(id)
    }
}
