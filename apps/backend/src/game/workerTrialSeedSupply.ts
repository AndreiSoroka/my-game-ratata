import type { FarmSupplyClientMessage } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { countInventoryItem } from './inventory'
import type { GameRoom } from './room'
import { hasNoRoute } from './workerFarm'
import { approachCharacter, stop } from './workerNavigation'
import type { WorkerIncident } from './workerRequestData'
import type { AuthorizedWorkerCommand } from './workerRequestPolicy'

const seedRetryMs = 5000

/** A verification visit stays bound to a bare plot on the saved worksite. */
export function advanceTrialSeedVisit(
    incident: WorkerIncident,
    actor: GameCharacter,
    room: GameRoom,
    now: number,
    perform: AuthorizedWorkerCommand
): boolean {
    const visit = incident.seedVisit
    if (visit === undefined) {
        return false
    }
    if (!validSeedVisit(incident, actor, room, visit.plotId, now)) {
        delete incident.seedVisit
        return false
    }
    if (visit.retry !== undefined && now < visit.retry.at) {
        showSeedRetry(incident, visit.retry)
        return true
    }
    const supplierId = room.adventureForWorkers().farmSupply.supplierId(actor)
    const supplier =
        supplierId === undefined ? undefined : room.getCharacter(supplierId)
    incident.activityIntent = 'get_seed'
    if (supplier?.alive !== true || supplier.tags.has('state.retired')) {
        stop(actor)
        incident.activityReason = 'supplier'
        incident.view.reason = 'Городской поставщик семян сейчас недоступен.'
        return true
    }
    if (!approachCharacter(actor, room, supplier)) {
        const moving = !hasNoRoute(actor)
        incident.activityReason = moving ? 'working' : 'route'
        incident.view.reason = moving
            ? 'Работник идёт к городскому поставщику за семенем для проверки.'
            : 'К поставщику семян нет доступного пути.'
        return true
    }
    issueTrialSeed(incident, actor, room, supplier, visit, now, perform)
    return true
}

function validSeedVisit(
    incident: WorkerIncident,
    actor: GameCharacter,
    room: GameRoom,
    plotId: string,
    now: number
): boolean {
    return (
        incident.claim !== null &&
        incident.view.proofAccepted &&
        incident.seedAdvanceUsed !== true &&
        countInventoryItem(actor.inventory, 'wheat_seed') === 0 &&
        room
            .adventureForWorkers()
            .farmSnapshot(incident.target.locationId, now)
            .some((plot) => plot.id === plotId && plot.phase === 'bare')
    )
}

type SeedVisit = NonNullable<WorkerIncident['seedVisit']>

function issueTrialSeed(
    incident: WorkerIncident,
    actor: GameCharacter,
    room: GameRoom,
    supplier: GameCharacter,
    visit: SeedVisit,
    now: number,
    perform: AuthorizedWorkerCommand
): void {
    const message: FarmSupplyClientMessage = {
        type: 'farm_supply',
        npcId: supplier.id,
        plotId: visit.plotId,
        requestId: incident.view.id,
    }
    const result = room
        .adventureForWorkers()
        .farmSupply.withTrialAdvance(actor, message, () =>
            perform(actor, message, room, now)
        )
    if (result.accepted) {
        incident.seedAdvanceUsed = true
        delete incident.seedVisit
        incident.activityIntent = 'check_work'
        incident.view.reason =
            'Семя получено. Работник возвращается на участок для посева.'
        return
    }
    const reason =
        result.error ?? 'Городской поставщик не выдал семя для проверки.'
    visit.retry = {
        at: now + seedRetryMs,
        reason,
        block: reason.includes('рюкзак') ? 'bag' : 'seeds',
    }
    showSeedRetry(incident, visit.retry)
}

function showSeedRetry(
    incident: WorkerIncident,
    retry: NonNullable<SeedVisit['retry']>
): void {
    incident.activityReason = retry.block
    incident.view.reason = retry.reason
    incident.activityUntil = retry.at
}
