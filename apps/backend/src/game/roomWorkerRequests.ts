import type {
    GuildQuestDefinition,
    WorkRequestSnapshot,
} from '@my-game-ratata/contracts'

import type { AdventureService } from './adventure'
import type { GameCharacter } from './character'
import type { WorkerGuildGateway } from './guild'
import { PartyService } from './parties'
import { guildContact } from './partyRules'
import type { GameRoom } from './room'
import { WORKER_SETTLEMENT_PROFILES } from './workerRequestData'
import type { WorkerRequestService } from './workerRequests'

/** Guild contracts refer to world incidents; neither UI nor party state owns a worker. */
export function createWorkerGuildGateway(
    service: WorkerRequestService,
    room: () => GameRoom
): WorkerGuildGateway {
    return {
        list: () => service.list().map(workRequestDefinition),
        active: (key) => service.active(key),
        accept: (id, key, members, characters, now) =>
            service.accept(id, key, members, characters, now),
        report: (id, key, actor, now) =>
            service.report(id, key, actor, room(), now),
        checkTurnIn: (id, key, now) =>
            service.checkTurnIn(id, key, room(), now),
        complete: (id, key) => service.complete(id, key),
        abandon: (id, key, now) => service.abandon(id, key, now),
        moveGroup: (from, to) => service.moveGroup(from, to),
        releaseGroup: (key, now) => service.releaseGroup(key, now),
        refreshGroup: (key, members) => service.setGroupMembers(key, members),
        canContact: ({ requestId, npc }) =>
            service.snapshot(requestId)?.clerkId === npc.id,
    }
}

function workRequestDefinition(
    view: WorkRequestSnapshot
): GuildQuestDefinition {
    return {
        id: view.id,
        title: `Помочь вернуться к работе: ${view.workerName}`,
        description: `${view.workerName} не может работать в ${view.locationName}: мешает ${view.enemyName}. Принесите один трофей, сообщите о расчистке и дождитесь рабочего рейса.`,
        goal: 1,
        rewardGold: 30,
        workRequest: view,
    }
}

export function canContactGuild(
    actor: GameCharacter,
    npc: GameCharacter,
    room: GameRoom
): boolean {
    const authoredClerk = WORKER_SETTLEMENT_PROFILES.some(
        (profile) =>
            profile.cityId === npc.locationId && profile.clerkId === npc.id
    )
    const reachable =
        npc.controllerKind !== 'network_player' &&
        npc.alive &&
        npc.faction === actor.faction &&
        npc.locationId === actor.locationId &&
        Math.hypot(
            actor.position.x - npc.position.x,
            actor.position.y - npc.position.y
        ) <= 64
    return (
        (guildContact(actor, npc) || (authoredClerk && reachable)) &&
        room.navigationFor(actor).hasLineOfSight(actor.position, npc.position)
    )
}

export function configureRoomQuests(
    room: GameRoom,
    adventure: AdventureService,
    parties: PartyService,
    characters: ReadonlyMap<string, GameCharacter>
): void {
    adventure.setWorkPermission((actor, message) =>
        room.workerRequests.allowsWork(actor.id, message)
    )
    adventure.setQuestRewardMembers((actorId) => {
        parties.update(characters.values(), Date.now())
        return parties.rewardMembers(actorId)
    })
}

export function createRoomParties(
    room: GameRoom,
    adventure: AdventureService
): PartyService {
    return new PartyService(adventure.grantQuestGoldOnce, {
        workers: createWorkerGuildGateway(room.workerRequests, () => room),
        canContact: (actor, npc) => canContactGuild(actor, npc, room),
    })
}
