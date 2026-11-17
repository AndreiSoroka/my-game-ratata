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
            const key = [...this.jobs].find(
                ([, current]) => current.id === job.id
            )?.[0]
            if (key !== undefined) {
                this.workers?.releaseGroup(key, now)
                this.drop(key, 'Заказчик погиб. Договор отменён.')
            }
        })
    }

    public drop(key: string, notice: string): void {
        const job = this.jobs.get(key)
        if (job === undefined) {
            return
        }
        if (!job.completed) {
            job.cancelled = true
        }
        job.rewardNotice = notice
        job.closeDeathListener?.()
        this.rewards?.funding.reservations.release(job.id)
        this.slots.release(job.id)
        this.jobs.delete(key)
    }

    public reconcile(key: string): void {
        const job = this.jobs.get(key)
        if (job !== undefined && !refreshWorkerJob(this.workers, job, key)) {
            this.drop(key, 'Обращение больше недоступно.')
        }
    }

    public stop(): void {
        for (const key of this.jobs.keys()) {
            this.workers?.releaseGroup(key, 0)
            this.drop(key, 'Мир остановлен. Договор отменён.')
        }
    }
}
