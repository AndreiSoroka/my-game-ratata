import type {
    SpeechActivityCommand,
    SpeechActivitySnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { NavigationService } from './navigation'
import { canHearSpeech, speechAvailable } from './socialSpeech'

interface ActivityWorld {
    getCharacter(id: string): GameCharacter | undefined
    navigationFor(actor: GameCharacter): NavigationService
}
interface Activity extends SpeechActivityCommand {
    actorId: string
    locationId: string
    expiresAt: number
    updatedAt: number
}

export function parseSpeechActivity(
    input: Record<string, unknown>
): SpeechActivityCommand | undefined {
    const { active, channel, targetId, activityId } = input
    if (
        typeof active !== 'boolean' ||
        (channel !== 'say' && channel !== 'whisper') ||
        !validActivityId(activityId) ||
        (targetId !== undefined && !validActivityId(targetId)) ||
        (channel === 'whisper' && targetId === undefined)
    ) {
        return undefined
    }
    return {
        type: 'speech_activity',
        active,
        channel,
        activityId,
        ...(typeof targetId === 'string' ? { targetId } : {}),
    }
}

/** Presentation only: no draft text, movement locks, or model calls. */
export class SpeechActivityService {
    private readonly activities = new Map<string, Activity>()
    public constructor(private readonly world: ActivityWorld) {}

    public handle(
        actor: GameCharacter,
        command: SpeechActivityCommand,
        now: number
    ): void {
        const previous = this.activities.get(actor.id)
        if (!command.active) {
            if (previous?.activityId === command.activityId) {
                this.activities.delete(actor.id)
            }
            return
        }
        if (!speechAvailable(actor) || !actor.soul.canSpeak) {
            return
        }
        if (
            command.channel === 'whisper' &&
            !this.privateAvailable(actor, command.targetId, now)
        ) {
            return
        }
        if (
            previous?.activityId === command.activityId &&
            now - previous.updatedAt < 900
        ) {
            return
        }
        this.activities.set(actor.id, {
            ...command,
            actorId: actor.id,
            locationId: actor.locationId,
            updatedAt: now,
            expiresAt: now + 4000,
        })
    }

    public clear(actorId: string): void {
        this.activities.delete(actorId)
    }

    public snapshot(
        observer: GameCharacter,
        now: number
    ): SpeechActivitySnapshot[] {
        const result: SpeechActivitySnapshot[] = []
        for (const [id, activity] of this.activities) {
            const actor = this.world.getCharacter(id)
            if (
                actor === undefined ||
                activity.expiresAt <= now ||
                !speechAvailable(actor) ||
                actor.locationId !== activity.locationId ||
                (activity.channel === 'whisper' &&
                    !this.privateAvailable(actor, activity.targetId, now))
            ) {
                this.activities.delete(id)
                continue
            }
            if (
                this.visible(
                    observer,
                    actor,
                    activity.channel,
                    activity.targetId,
                    now
                )
            ) {
                result.push({
                    actorId: id,
                    id: activity.activityId,
                    kind: 'typing',
                })
            }
        }
        return result
    }

    public visible(
        observer: GameCharacter,
        actor: GameCharacter,
        channel: 'say' | 'whisper',
        targetId: string | undefined,
        now: number
    ): boolean {
        if (!speechAvailable(observer) || !speechAvailable(actor)) {
            return false
        }
        if (observer.id === actor.id) {
            return true
        }
        if (channel === 'whisper' && observer.id !== targetId) {
            return false
        }
        return canHearSpeech(
            observer,
            actor,
            this.world.navigationFor(actor),
            now,
            channel === 'whisper' ? 48 : 80
        )
    }

    private privateAvailable(
        actor: GameCharacter,
        targetId: string | undefined,
        now: number
    ): boolean {
        const target =
            targetId === undefined
                ? undefined
                : this.world.getCharacter(targetId)
        return (
            target !== undefined &&
            target.soul.canSpeak &&
            canHearSpeech(
                target,
                actor,
                this.world.navigationFor(actor),
                now,
                48
            )
        )
    }
}

function validActivityId(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= 100
}
