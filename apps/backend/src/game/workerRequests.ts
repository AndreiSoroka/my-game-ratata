import {
    type AdventureClientMessage,
    type WorkerSettlementProfile,
    type WorkerWorkTarget,
    type WorkRequestSnapshot,
} from '@my-game-ratata/contracts'

import type { AdventureActionResult } from './adventureTrading'
import type { GameCharacter } from './character'
import { consumeInventoryItems } from './inventory'
import { resetMartyrStreak } from './martyr'
import type { GameRoom } from './room'
import { canPerformSkillAction } from './skillProgression'
import { stop } from './workerNavigation'
import {
    completeWorkerRequest,
    reconcileWorkerIncident,
    releaseWorkerClaim,
    releaseWorkerGroup,
} from './workerRequestClaims'
import { createWorkerIncident } from './workerRequestCreation'
import {
    isWorkerProduction,
    openIncident,
    publishedWorkerViews,
    viewWorkerIncident,
    WORKER_SETTLEMENT_PROFILES,
    type WorkerIncident,
} from './workerRequestData'
import { advanceWorkerIncident } from './workerRequestPolicy'
import { atClerk, unsafeWorkPoint } from './workerRequestSafety'
import {
    WORKER_WORK_ADAPTERS,
    type WorkerWorkAdapter,
} from './workerRequestWork'

/** Session-owned incidents survive controller replacement and never mint production. */
export class WorkerRequestService {
    private readonly requests = new Map<string, WorkerIncident>()
    private readonly byWorker = new Map<string, WorkerIncident>()
    private readonly permits = new Map<string, AdventureClientMessage>()
    private characters: ReadonlyMap<string, GameCharacter> = new Map()
    private nextId = 1

    public constructor(
        private readonly profiles: readonly WorkerSettlementProfile[] = WORKER_SETTLEMENT_PROFILES,
        private readonly adapters: ReadonlyMap<
            string,
            WorkerWorkAdapter
        > = WORKER_WORK_ADAPTERS
    ) {}

    public list(cityId?: string): WorkRequestSnapshot[] {
        return publishedWorkerViews(this.requests.values(), cityId)
    }

    public snapshot(requestId: string): WorkRequestSnapshot | null {
        return viewWorkerIncident(this.requests.get(requestId))
    }

    public forWorker(actorId: string): WorkRequestSnapshot | null {
        return viewWorkerIncident(this.byWorker.get(actorId))
    }

    public active(groupKey: string): WorkRequestSnapshot | null {
        const request = [...this.requests.values()].find(
            (candidate) =>
                candidate.claim?.key === groupKey && openIncident(candidate)
        )
        return viewWorkerIncident(request)
    }

    public accept(
        requestId: string,
        groupKey: string,
        memberIds: ReadonlySet<string>,
        characters: ReadonlyMap<string, GameCharacter>,
        now: number
    ): string | null {
        this.reconcile(characters, now)
        const request = this.requests.get(requestId)
        if (
            request === undefined ||
            !request.published ||
            !openIncident(request) ||
            request.view.stage !== 'waiting'
        ) {
            return 'Это обращение сейчас недоступно.'
        }
        if (request.claim !== null || this.active(groupKey) !== null) {
            return 'Обращение уже принято или у группы есть действующее обращение.'
        }
        request.claim = {
            key: groupKey,
            members: new Set(memberIds),
            lastOnlineAt: now,
        }
        request.view.reason = null
        return null
    }

    public report(
        requestId: string,
        groupKey: string,
        actor: GameCharacter,
        room: GameRoom,
        now: number
    ): string | null {
        const request = this.claimed(requestId, groupKey)
        if (request?.view.stage !== 'waiting') {
            return 'Сейчас нельзя начать проверку этого обращения.'
        }
        const worker = room.getCharacter(request.view.workerId)
        if (worker?.alive !== true) {
            return 'Работник сейчас не может проверить участок.'
        }
        if (
            !canPerformSkillAction(actor, now) ||
            !atClerk(actor, request.clerkId, room)
        ) {
            return 'Подойди к живому распорядителю обращения.'
        }
        if (
            !request.view.proofAccepted &&
            !consumeInventoryItems(actor.inventory, {
                [request.view.requiredTrophyItemId]: 1,
            })
        ) {
            return 'Принеси один требуемый трофей в своей сумке.'
        }
        if (!request.view.proofAccepted) {
            resetMartyrStreak(actor)
        }
        request.view.proofAccepted = true
        request.view.stage = 'outbound'
        request.view.reason = null
        request.returnReady = false
        request.trialPoint = null
        return null
    }

    public checkTurnIn(
        requestId: string,
        groupKey: string,
        room: GameRoom,
        now: number
    ): string | null {
        const request = this.claimed(requestId, groupKey)
        if (request?.view.stage !== 'ready' || request.trialPoint === null) {
            return 'Работник ещё не подтвердил рабочий рейс.'
        }
        const worker = room.getCharacter(request.view.workerId)
        if (
            worker?.alive !== true ||
            worker.tags.has('state.retired') ||
            !atClerk(worker, request.clerkId, room)
        ) {
            return 'Дождись живого работника у распорядителя.'
        }
        if (
            [request.attackPoint, request.trialPoint].some((point) =>
                unsafeWorkPoint(worker, point, this.characters, room, now)
            )
        ) {
            request.view.stage = 'waiting'
            request.view.reason =
                'На участке снова опасно. Нужен новый рабочий рейс.'
            request.trialPoint = null
            request.returnReady = false
            return request.view.reason
        }
        return null
    }

    public complete(requestId: string, groupKey: string): boolean {
        return this.completeWith(requestId, groupKey, () => true)
    }

    public completeWith(
        requestId: string,
        groupKey: string,
        payment: () => boolean
    ): boolean {
        return completeWorkerRequest(this.claimed(requestId, groupKey), payment)
    }

    public abandon(
        requestId: string,
        groupKey: string,
        now: number
    ): string | null {
        this.reconcile(this.characters, now)
        const request = this.claimed(requestId, groupKey)
        if (request === undefined) {
            return 'Нет такого принятого обращения.'
        }
        releaseWorkerClaim(request)
        return null
    }

    public moveGroup(from: string, to: string): void {
        for (const request of this.requests.values()) {
            if (request.claim?.key === from) {
                request.claim.key = to
            }
        }
    }

    public setGroupMembers(
        groupKey: string,
        members: ReadonlySet<string>
    ): void {
        for (const request of this.requests.values()) {
            if (request.claim?.key === groupKey) {
                request.claim.members = new Set(members)
            }
        }
    }

    public releaseGroup(groupKey: string, now: number): void {
        releaseWorkerGroup(
            this.requests.values(),
            this.characters,
            groupKey,
            now
        )
    }

    public reconcile(
        characters: ReadonlyMap<string, GameCharacter>,
        now: number
    ): void {
        this.characters = characters
        for (const request of this.requests.values()) {
            reconcileWorkerIncident(request, characters, now)
        }
    }

    public allowsWork(
        actorId: string,
        message: AdventureClientMessage
    ): boolean {
        const request = this.byWorker.get(actorId)
        return (
            request === undefined ||
            !openIncident(request) ||
            !isWorkerProduction(message) ||
            this.permits.get(actorId) === message
        )
    }

    public updateWorker(
        actor: GameCharacter,
        job: string,
        room: GameRoom,
        now: number,
        target?: WorkerWorkTarget,
        onWork?: (message: AdventureClientMessage) => void
    ): boolean {
        let request = this.byWorker.get(actor.id)
        if (request === undefined || !openIncident(request)) {
            request = createWorkerIncident(
                `worker-request-${String(this.nextId)}`,
                actor,
                job,
                room,
                now,
                this.profiles,
                this.adapters,
                target
            )
            if (request !== undefined) {
                this.nextId += 1
                stop(actor)
                this.requests.set(request.view.id, request)
                this.byWorker.set(actor.id, request)
            }
        }
        if (request === undefined || !openIncident(request)) {
            return false
        }
        advanceWorkerIncident(
            request,
            actor,
            room,
            now,
            (worker, message, context, at) => {
                const result = this.perform(worker, message, context, at)
                if (result.accepted) {
                    onWork?.(message)
                }
                return result
            }
        )
        return true
    }

    private claimed(id: string, key: string): WorkerIncident | undefined {
        const request = this.requests.get(id)
        return request?.claim?.key === key && openIncident(request)
            ? request
            : undefined
    }

    private perform(
        actor: GameCharacter,
        message: AdventureClientMessage,
        room: GameRoom,
        now: number
    ): AdventureActionResult {
        this.permits.set(actor.id, message)
        try {
            const result = room.requestAdventure(actor, message, now)
            room.publishEvents(result.events)
            return result
        } finally {
            this.permits.delete(actor.id)
        }
    }
}
