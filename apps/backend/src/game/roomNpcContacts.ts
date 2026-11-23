import type {
    ClientMessage,
    GameEventPayload,
    MerchantServiceView,
    NpcInteractionService,
} from '@my-game-ratata/contracts'

import type { NpcAiCoordinator } from '../ai/coordinator'
import type { AdventureService } from './adventure'
import { resolveAdventureNpc } from './adventureNpc'
import type { GameCharacter } from './character'
import { recruitableNpc } from './npcRoster'
import type { GameRoom } from './room'
import {
    type NpcHeardSpeech,
    RoomNpcConversations,
} from './roomNpcConversations'
import { canConverseWithNpc } from './socialSpeech'
import type { WhisperService } from './whispers'

export class RoomNpcContacts {
    public readonly turns: RoomNpcConversations
    private sequence = 0

    public constructor(
        private readonly room: GameRoom,
        private readonly adventure: AdventureService,
        whispers: WhisperService,
        private readonly ai: () => NpcAiCoordinator | undefined,
        private readonly onAddressedSpeech: (
            speaker: GameCharacter,
            recipient: GameCharacter,
            event: NpcHeardSpeech
        ) => NpcHeardSpeech
    ) {
        this.turns = new RoomNpcConversations(room, adventure, whispers)
    }

    public handle(
        actor: GameCharacter,
        message: ClientMessage,
        now: number
    ): boolean {
        switch (message.type) {
            case 'interact':
                return this.open(
                    actor,
                    message.targetId,
                    now,
                    undefined,
                    message.service
                )
            case 'companion_request':
                return message.request === 'talk'
                    ? this.open(actor, message.targetId, now, message.text)
                    : this.unavailableCompanion(actor, message.targetId)
            case 'whisper_close':
                this.turns.close(actor.id, 'whisper')
                break
            case 'dialogue_choice':
                if (['close', 'leave'].includes(message.choiceId)) {
                    this.turns.close(actor.id, 'panel')
                }
                break
        }
        return false
    }

    public receive(
        actor: GameCharacter,
        event: NpcHeardSpeech,
        targetId: string,
        source: 'whisper' | 'panel' = 'whisper'
    ): void {
        if (actor.controllerKind !== 'network_player') {
            return
        }
        const npc = this.room.getCharacter(targetId)
        if (npc?.controllerKind === 'network_player') {
            return
        }
        if (!this.hears(actor, npc, event.at)) {
            this.notice(
                actor,
                'Подойди к живому собеседнику, чтобы он тебя услышал.'
            )
            return
        }
        this.room.rememberNpcMeeting(actor, npc)
        const heard = this.onAddressedSpeech(actor, npc, event)
        const ai = this.ai()
        const turn = this.turns.enqueue(
            actor,
            npc,
            heard,
            source,
            ai?.configured(npc.id) === true
        )
        if (turn !== undefined) {
            ai?.hear(actor, turn, npc.id)
        }
    }

    public fail(event: NpcHeardSpeech, now: number): void {
        if (event.conversationId !== undefined) {
            this.turns.fail(event.senderId, event.conversationId, now)
        }
    }

    public inquire(
        actor: GameCharacter,
        events: GameEventPayload[],
        now: number
    ): void {
        const question = events.find(
            (event) => event.kind === 'chat' && event.actorId === actor.id
        )
        if (question?.targetId === undefined || question.text === undefined) {
            return
        }
        this.receive(
            actor,
            {
                ...this.openingLine(actor, now, question.text),
                id: `inquiry:${actor.id}:${String(question.speechId)}`,
            },
            question.targetId
        )
    }

    public offerService(
        npc: GameCharacter,
        requesterId: string,
        service: MerchantServiceView | 'study' | 'prayer',
        now: number
    ): void {
        const actor = this.room.getCharacter(requesterId)
        if (
            actor === undefined ||
            !canConverseWithNpc(
                actor,
                npc,
                this.room.navigationFor(npc),
                now,
                48
            )
        ) {
            return
        }
        const dialogue = this.adventure.walletFor(actor.id).dialogue
        if (
            dialogue?.npcId === npc.id &&
            service !== 'study' &&
            service !== 'prayer'
        ) {
            dialogue.initialView = service
            return
        }
        const label = {
            shop: 'Товары',
            orders: 'Заказы',
            repair: 'Ремонт',
            study: 'Обучение',
            prayer: 'Молитвы',
        }[service]
        this.notice(
            actor,
            `Услуга «${label}» доступна в меню персонажа ${npc.nickname}.`
        )
    }

    private open(
        actor: GameCharacter,
        targetId: string,
        now: number,
        text?: string,
        service?: NpcInteractionService
    ): true {
        const navigation = this.room.navigationFor(actor)
        const characters = this.room.charactersFor(actor)
        const npc = resolveAdventureNpc(
            actor,
            targetId,
            characters,
            now,
            navigation
        )
        if (!this.hears(actor, npc, now)) {
            this.notice(
                actor,
                'Подойди к живому собеседнику, чтобы поговорить.'
            )
            return true
        }
        this.room.scenarios.pause(actor)
        const usePanel =
            this.ai()?.configured(npc.id) === true || service !== undefined
        const previous = this.adventure.walletFor(actor.id).dialogue
        if (usePanel && (previous?.npcId !== npc.id || text === undefined)) {
            const result = this.adventure.interactResult(
                actor,
                npc.id,
                characters,
                navigation,
                now,
                service
            )
            this.room.publishEvents(result.events)
            if (!result.accepted) {
                return true
            }
        } else if (!usePanel) {
            this.adventure.closeConversations(actor.id)
        }
        if (service !== undefined) {
            this.turns.close(actor.id)
            return true
        }
        this.receive(
            actor,
            this.openingLine(actor, now, text),
            npc.id,
            usePanel ? 'panel' : 'whisper'
        )
        return true
    }

    private openingLine(
        actor: GameCharacter,
        now: number,
        text?: string
    ): NpcHeardSpeech {
        const line = text?.trim() ?? ''
        const language = this.room.localeFor(actor.id)
        const opening =
            language === 'en'
                ? 'The player started a conversation. Greet them.'
                : 'Игрок начал разговор. Поздоровайся.'
        return {
            kind: 'message',
            id: `talk:${String(++this.sequence)}`,
            senderId: actor.id,
            text: line === '' ? opening : line,
            ...(line === '' ? { system: true, language } : {}),
            channel: 'whisper',
            locationId: actor.locationId,
            position: { ...actor.position },
            at: now,
        }
    }

    private hears(
        actor: GameCharacter,
        npc: GameCharacter | undefined,
        now: number
    ): npc is GameCharacter {
        return (
            npc?.soul.canSpeak === true &&
            (npc.faction === 'peaceful' ||
                this.ai()?.configured(npc.id) === true) &&
            canConverseWithNpc(
                npc,
                actor,
                this.room.navigationFor(actor),
                now,
                48
            )
        )
    }

    private unavailableCompanion(
        actor: GameCharacter,
        targetId: string
    ): boolean {
        if (
            recruitableNpc(targetId) &&
            this.ai()?.configured(targetId) === true
        ) {
            return false
        }
        this.notice(
            actor,
            'Этот персонаж сейчас не принимает просьбы о сопровождении.'
        )
        return true
    }

    private notice(actor: GameCharacter, text: string): void {
        this.room.publishEvents([
            {
                kind: 'notice',
                actorId: actor.id,
                audienceIds: [actor.id],
                text,
            },
        ])
    }
}
