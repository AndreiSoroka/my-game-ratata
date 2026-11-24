import { refreshQuestProgress } from './npcQuestProgress'
import type { NpcQuestEnvironment, NpcQuestRecord } from './npcQuestTypes'
import { promisedItemsUnchanged } from './promisedReward'
import type { RewardReservations } from './rewardReservations'

export class NpcQuestLifecycle {
    public constructor(
        private readonly environment: NpcQuestEnvironment,
        private readonly reservations: RewardReservations,
        private readonly onRelease?: (job: NpcQuestRecord) => void
    ) {}

    public refresh(job: NpcQuestRecord): void {
        if (['completed', 'cancelled'].includes(job.view.status)) {
            return
        }
        const issuer = this.environment.getCharacter(job.view.issuerId)
        if (
            issuer?.alive !== true ||
            issuer.deathSequence !== job.issuerDeath
        ) {
            this.cancel(
                job,
                'Заказчик погиб. Договор отменён; резерв освобождён.'
            )
        } else if (
            !this.reservations.valid(job.view.instanceId) ||
            !promisedItemsUnchanged(issuer.inventory, job.view.rewardItems)
        ) {
            job.view.status = 'reward_missing'
            job.view.notice =
                'Обещанная награда пропала. Нужны новые условия и ваше согласие; ничего не будет создано взамен.'
        } else if (!this.liveRoster(job)) {
            this.cancel(job, 'Группа договора больше недоступна.')
        } else {
            if (job.view.status === 'reward_missing') {
                job.view.status = 'active'
                job.view.notice = null
            }
            refreshQuestProgress(job, this.environment)
        }
    }

    private liveRoster(job: NpcQuestRecord): boolean {
        return [
            ...this.environment.parties.contractRoster(job.view.instanceId)
                .members,
        ].some((id) => {
            const actor = this.environment.getCharacter(id)
            return actor !== undefined && !actor.tags.has('state.retired')
        })
    }

    public cancel(job: NpcQuestRecord, notice: string): void {
        if (
            job.view.status === 'completed' ||
            job.view.status === 'cancelled'
        ) {
            return
        }
        job.view.status = 'cancelled'
        job.view.notice = notice
        this.release(job)
    }

    public release(job: NpcQuestRecord): void {
        this.reservations.release(job.view.instanceId)
        this.environment.parties.contractSlots.release(job.view.instanceId)
        job.closeDeathListener?.()
        this.onRelease?.(job)
    }
}
