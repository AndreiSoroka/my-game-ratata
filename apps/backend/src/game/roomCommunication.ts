import type {
    ClientMessage,
    NpcRequestStatus,
    SocialSnapshot,
} from '@my-game-ratata/contracts'

import type { NpcAiCoordinator } from '../ai/coordinator'
import type { GameCharacter } from './character'
import type { GameRoom } from './room'
import { SpeechActivityService } from './speechActivity'

export class RoomCommunication {
    private readonly speechActivity: SpeechActivityService
    private readonly statuses = new Map<string, NpcRequestStatus[]>()
    public constructor(
        private readonly room: GameRoom,
        private readonly ai: () => NpcAiCoordinator | undefined
    ) {
        this.speechActivity = new SpeechActivityService(room)
    }
    public handle(
        actor: GameCharacter,
        message: ClientMessage,
        now: number
    ): boolean {
        if (message.type === 'speech_activity') {
            this.speechActivity.handle(actor, message, now)
            return true
        }
        if (message.type === 'chat' || message.type === 'whisper') {
            this.speechActivity.clear(actor.id)
        }
        return false
    }
    public snapshot(
        actor: GameCharacter,
        now: number
    ): Pick<SocialSnapshot, 'speechActivity' | 'requestStatuses'> {
        return {
            requestStatuses: structuredClone(this.statuses.get(actor.id) ?? []),
            speechActivity: [
                ...this.speechActivity.snapshot(actor, now),
                ...(this.ai()?.replyActivities() ?? []).flatMap((entry) => {
                    const npc = this.room.getCharacter(entry.actorId)
                    return npc !== undefined &&
                        this.speechActivity.visible(
                            actor,
                            npc,
                            entry.channel,
                            entry.senderId,
                            now
                        )
                        ? [
                              {
                                  actorId: npc.id,
                                  id: entry.id,
                                  kind: 'thinking' as const,
                              },
                          ]
                        : []
                }),
            ],
        }
    }
    public report(requesterId: string, status: NpcRequestStatus): void {
        if (this.room.getCharacter(requesterId) === undefined) {
            return
        }
        const previous = this.statuses.get(requesterId) ?? []
        if (
            previous.some(
                (entry) =>
                    entry.id === status.id &&
                    entry.npcId === status.npcId &&
                    entry.state === status.state &&
                    entry.at === status.at
            )
        ) {
            return
        }
        this.statuses.set(requesterId, [...previous, { ...status }].slice(-32))
        this.room.publishEvents([
            {
                kind: 'npc_request_status',
                audienceIds: [requesterId],
                requestStatus: { ...status },
                speakerName:
                    this.room.getCharacter(status.npcId)?.nickname ??
                    'Персонаж',
            },
        ])
    }
}
