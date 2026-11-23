import type { GameCharacter } from './character'
import type { NecromancerScene } from './necromancerTactics'
import type { GameRoom } from './room'
import { canHearSpeech } from './socialSpeech'
import { createSpeechEvent } from './speechReceipts'

export const necromancerBarks = ['warning', 'cover', 'steady'] as const
export type NecromancerBark = (typeof necromancerBarks)[number]

export function isNecromancerBark(value: unknown): value is NecromancerBark {
    return necromancerBarks.some((bark) => value === bark)
}

export interface NecromancerRemark {
    text: string
    targetId?: string
}

interface PendingRemark extends NecromancerRemark {
    until: number
    locationId: string
    deathSequence: number
}

/** An accepted model remark may be heard once during its original scene. */
export class NecromancerSpeech {
    private nextAt = -Infinity
    private pending: PendingRemark | undefined

    public advance(
        actor: GameCharacter,
        room: GameRoom,
        scene: NecromancerScene,
        now: number,
        remark?: NecromancerRemark
    ): void {
        if (remark !== undefined) {
            this.pending = {
                ...remark,
                until: now + 4_000,
                locationId: scene.locationId,
                deathSequence: scene.deathSequence,
            }
        }
        const pending = this.pending
        if (pending === undefined) {
            return
        }
        if (
            now >= pending.until ||
            scene.locationId !== pending.locationId ||
            scene.deathSequence !== pending.deathSequence
        ) {
            this.pending = undefined
            return
        }
        if (now < this.nextAt || !actor.soul.canSpeak) {
            return
        }

        const navigation = room.navigationFor(actor)
        const audible = scene.visible.some(
            (target) =>
                target.connected &&
                target.controllerKind === 'network_player' &&
                (pending.targetId === undefined ||
                    pending.targetId === target.id) &&
                canHearSpeech(target, actor, navigation, now)
        )
        if (!audible) {
            return
        }
        this.pending = undefined
        this.nextAt = now + 1_500
        room.publishEvents([
            createSpeechEvent(
                actor,
                pending.text,
                pending.targetId === undefined
                    ? {}
                    : {
                          targetId: pending.targetId,
                          audienceIds: [pending.targetId],
                      }
            ),
        ])
    }
}
