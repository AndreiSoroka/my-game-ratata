import { onCharacterDeath } from './characterDeathObservers'
import type { ContractSlots } from './contractSlots'
import type { GuildRewardEnvironment } from './guildRewards'
import type { GuildJob } from './guildRules'
import {
    refreshWorkerJob,
    type WorkerGuildGateway,
} from './guildWorkerRequests'

/** Every removal releases the same accepted reservation and identity-bound listener. */
export class GuildJobLifecycle {
    public constructor(
        private readonly jobs: Map<string, GuildJob>,
        private readonly slots: ContractSlots,
        private readonly workers: WorkerGuildGateway | undefined,
        private readonly rewards: GuildRewardEnvironment | undefined
    ) {}

    public watchIssuer(job: GuildJob, now: number): void {
        if (job.reward === undefined) {
            return
        }
        job.closeDeathListener = onCharacterDeath(job.reward.issuer, () => {
            const key = this.slots.keyFor(job.id)
            const request = job.definition.workRequest
            if (key !== undefined && request !== undefined) {
                this.workers?.abandon(request.id, key, now)
                this.drop(job, 'Заказчик погиб. Договор отменён.')
            }
        })
    }

    public drop(job: GuildJob, notice: string): void {
        job.cancelled = true
        job.rewardNotice = notice
        this.remove(job)
    }

    public remove(job: GuildJob): void {
        job.closeDeathListener?.()
        this.rewards?.funding.reservations.release(job.id)
        this.slots.release(job.id)
        this.jobs.delete(job.id)
    }

    public reconcile(key: string): void {
        for (const id of this.slots.idsFor(key)) {
            const job = this.jobs.get(id)
            if (
                job !== undefined &&
                !refreshWorkerJob(this.workers, job, key)
            ) {
                this.drop(job, 'Обращение больше недоступно.')
            }
        }
    }

    public release(key: string, now: number): void {
        this.workers?.releaseGroup(key, now)
        for (const id of this.slots.idsFor(key)) {
            const job = this.jobs.get(id)
            if (job !== undefined) {
                this.drop(job, 'Группа больше не выполняет договор.')
            }
        }
    }

    public stop(): void {
        for (const job of this.jobs.values()) {
            const key = this.slots.keyFor(job.id)
            const request = job.definition.workRequest
            if (key !== undefined && request !== undefined) {
                this.workers?.abandon(request.id, key, 0)
            }
            this.drop(job, 'Мир остановлен. Договор отменён.')
        }
    }
}
