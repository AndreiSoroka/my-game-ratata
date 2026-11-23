import type { GameCharacter } from './character'
import type { NecromancerScene } from './necromancerTactics'
import type { GameRoom } from './room'
import { canHearSpeech } from './socialSpeech'
import { createSpeechEvent } from './speechReceipts'

const battleSpeech = {
    warning: 'Берегись! Здесь ещё есть враги.',
    cover: 'Держись за камнями!',
    steady: 'Сначала разберусь с угрозой.',
} as const

export type NecromancerBark = keyof typeof battleSpeech
export const necromancerBarks = Object.keys(battleSpeech) as NecromancerBark[]

export function isNecromancerBark(value: unknown): value is NecromancerBark {
    return necromancerBarks.some((bark) => value === bark)
}

interface PendingBark {
    text: string
    until: number
    locationId: string
    deathSequence: number
}

/** Speech has its own cadence and never takes over a movement or combat action. */
export class NecromancerSpeech {
    private readonly greeted = new Set<string>()
    private readonly warned = new Set<string>()
    private nextAt = -Infinity
    private nextAsideAt = -Infinity
    private lowWarned = false
    private pending: PendingBark | undefined

    public advance(
        actor: GameCharacter,
        room: GameRoom,
        scene: NecromancerScene,
        now: number,
        bark?: NecromancerBark
    ): void {
        this.trackBattle(scene, actor, now, bark)
        if (now < this.nextAt || !actor.soul.canSpeak) {
            return
        }
        const navigation = room.navigationFor(actor)
        const audience = scene.visible.filter(
            (target) =>
                target.connected &&
                target.controllerKind === 'network_player' &&
                canHearSpeech(target, actor, navigation, now)
        )
        if (audience.length === 0) {
            return
        }
        const selfWarning = this.lowHealthWarning(actor, scene)
        if (selfWarning !== undefined) {
            this.say(actor, room, selfWarning, now)
        } else if (this.pending !== undefined) {
            this.say(actor, room, this.pending.text, now)
            this.pending = undefined
        } else {
            this.addressVisitor(actor, room, scene, audience, now)
        }
    }

    public thinkAloud(
        actor: GameCharacter,
        room: GameRoom,
        scene: NecromancerScene,
        note: string | undefined,
        now: number
    ): void {
        if (
            note !== undefined &&
            note.length > 0 &&
            now >= Math.max(this.nextAsideAt, this.nextAt) &&
            !actor.hasPath() &&
            scene.visible.some((target) => target.connected)
        ) {
            this.nextAsideAt = now + 600_000
            this.say(actor, room, note, now)
        }
    }

    private trackBattle(
        scene: NecromancerScene,
        actor: GameCharacter,
        now: number,
        bark?: NecromancerBark
    ): void {
        if (scene.threat === undefined || actor.hp > actor.maxHp * 0.4) {
            this.lowWarned = false
        }
        if (bark !== undefined) {
            this.pending = {
                text: battleSpeech[bark],
                until: now + 4_000,
                locationId: scene.locationId,
                deathSequence: scene.deathSequence,
            }
        }
        const pending = this.pending
        if (
            pending !== undefined &&
            (scene.threat === undefined ||
                now >= pending.until ||
                scene.locationId !== pending.locationId ||
                scene.deathSequence !== pending.deathSequence)
        ) {
            this.pending = undefined
        }
    }

    private lowHealthWarning(
        actor: GameCharacter,
        scene: NecromancerScene
    ): string | undefined {
        if (
            this.lowWarned ||
            scene.threat === undefined ||
            actor.hp > actor.maxHp * 0.3
        ) {
            return undefined
        }
        this.lowWarned = true
        return 'Меня задело. Отступаю к камням!'
    }

    private addressVisitor(
        actor: GameCharacter,
        room: GameRoom,
        scene: NecromancerScene,
        audience: GameCharacter[],
        now: number
    ): void {
        const wounded = audience.find(
            ({ id }) => id === scene.playerId && !this.warned.has(id)
        )
        if (wounded !== undefined) {
            rememberVisitor(this.warned, wounded.id)
            rememberVisitor(this.greeted, wounded.id)
            this.say(
                actor,
                room,
                'Ты ранен. У старой плиты безопаснее.',
                now,
                wounded.id
            )
            return
        }
        const newcomer = audience.find(({ id }) => !this.greeted.has(id))
        if (newcomer !== undefined) {
            rememberVisitor(this.greeted, newcomer.id)
            this.say(
                actor,
                room,
                'Осторожнее в руинах, путник.',
                now,
                newcomer.id
            )
        }
    }

    private say(
        actor: GameCharacter,
        room: GameRoom,
        text: string,
        now: number,
        targetId?: string
    ): void {
        this.nextAt = now + 1_500
        room.publishEvents([
            createSpeechEvent(
                actor,
                text,
                targetId === undefined
                    ? {}
                    : { targetId, audienceIds: [targetId] }
            ),
        ])
    }
}

function rememberVisitor(visitors: Set<string>, id: string): void {
    if (visitors.size >= 96) {
        const oldest = visitors.values().next().value
        if (oldest !== undefined) {
            visitors.delete(oldest)
        }
    }
    visitors.add(id)
}
