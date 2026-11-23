import type {
    ClientMessage,
    GameEventPayload,
    PartyClientMessage,
    ProgressionClientMessage,
} from '@my-game-ratata/contracts'

import { handleAbilityCommand } from './abilityCommands'
import type { AbilityContext } from './abilityContext'
import type { AdventureService } from './adventure'
import type { GameCharacter } from './character'
import { canObserveRoomCharacter } from './characterSight'
import type { CompanionService } from './companions'
import { isAdventureCommand } from './extraCommands'
import { handleMovementCommand } from './movementActions'
import { handleDashWithFeedback } from './movementFeedback'
import type { PartyService } from './parties'
import { handleProgressionCommand } from './progressionCommands'
import type { TheftService } from './theft'
import { isTheftCommand } from './theftCommands'
import type { WorldInventory } from './worldInventory'

interface ActionContext extends AbilityContext {
    theft: TheftService
    adventure: AdventureService
    allCharacters: Iterable<GameCharacter>
    parties: PartyService
    characters: GameCharacter[]
    companions: CompanionService
    inventory: WorldInventory
    message: ClientMessage
    player: GameCharacter
}

/** All controllers share these actions; clients never send resulting state. */
export function handleRoomAction(
    context: ActionContext
): GameEventPayload[] | undefined {
    const { player, message, characters, now } = context
    const abilityEvents = abilityAction(context)
    if (abilityEvents !== undefined) {
        return abilityEvents
    }
    if (message.type === 'dash') {
        return handleDashWithFeedback(player, now)
    }
    if (message.type === 'movement_mode') {
        return handleMovementCommand(player, message, now)
    }
    if (isTheftCommand(message)) {
        return context.theft.handle(player, message, {
            characters: context.allCharacters,
            adventure: context.adventure,
            navigation: context.navigation,
            now,
        })
    }
    if (isAdventureCommand(message)) {
        const events = context.adventure.handle(
            player,
            message,
            characters,
            context.navigation
        )
        rememberConversation(context, events)
        return events
    }
    if (isPartyCommand(message)) {
        return context.parties.handle(
            player,
            message,
            context.allCharacters,
            now,
            context.navigation
        )
    }
    if (message.type === 'companion_request') {
        return companionAction(context, message)
    }
    if (isProgressionCommand(message)) {
        const events = handleProgressionCommand(player, message, context)
        return [
            ...events,
            ...context.inventory.dropLootForDeaths(events, (id) =>
                characters.find((character) => character.id === id)
            ),
        ]
    }

    return undefined
}

function isProgressionCommand(
    message: ClientMessage
): message is ProgressionClientMessage {
    return [
        'pray',
        'learn_skill',
        'cast_spell',
        'choose_deity',
        'study_magic',
        'teach_magic',
    ].includes(message.type)
}

function isPartyCommand(message: ClientMessage): message is PartyClientMessage {
    return [
        'party_invite',
        'party_answer',
        'party_leave',
        'guild_accept',
        'guild_turn_in',
        'guild_report',
        'guild_abandon',
    ].includes(message.type)
}

function rememberConversation(
    context: ActionContext,
    events: GameEventPayload[]
): void {
    const { message, player, characters, companions } = context
    if (message.type !== 'interact') {
        return
    }
    const replied = events.some(
        (event) =>
            event.kind === 'chat' &&
            event.actorId === message.targetId &&
            event.targetId === player.id
    )
    if (replied) {
        companions.rememberMeeting(
            player,
            characters.find((character) => character.id === message.targetId)
        )
    }
}

function abilityAction(context: ActionContext): GameEventPayload[] | undefined {
    const { message, player, characters } = context
    if (message.type === 'revive') {
        return handleAbilityCommand(
            player,
            {
                type: 'use_ability',
                abilityId: 'pray',
                intent: { mode: 'revive', targetId: message.targetId },
            },
            context
        )
    }
    if (
        message.type === 'use_ability' ||
        message.type === 'learn_ability' ||
        message.type === 'cancel_magic' ||
        message.type === 'cancel_prayer'
    ) {
        const events = handleAbilityCommand(player, message, context)
        return [
            ...events,
            ...context.inventory.dropLootForDeaths(events, (id) =>
                characters.find((character) => character.id === id)
            ),
        ]
    }

    return undefined
}

function companionAction(
    context: ActionContext,
    message: Extract<ClientMessage, { type: 'companion_request' }>
): GameEventPayload[] {
    const { player, characters, now } = context
    if (message.request === 'talk') {
        const npc = characters.find(
            (character) => character.id === message.targetId
        )
        const events = context.adventure.interact(
            player,
            message.targetId,
            characters,
            context.navigation,
            now,
            undefined,
            npc === undefined
                ? undefined
                : context.companions.dialogueText(player, npc)
        )
        if (
            events.some(
                (event) =>
                    event.kind === 'chat' && event.actorId === message.targetId
            )
        ) {
            context.companions.rememberMeeting(
                player,
                characters.find(
                    (character) => character.id === message.targetId
                )
            )
        }
        return events
    }
    const visible = characters.filter(
        (candidate) =>
            candidate.id !== message.targetId ||
            canObserveRoomCharacter(player, candidate, context.navigation, now)
    )
    return context.companions.handle(player, message, visible, now, {
        questCompleted: (actorId, questId) =>
            context.adventure.hasCompletedQuest(actorId, questId),
        hasLineOfSight: (actor, npc) =>
            context.navigation.hasLineOfSight(actor.position, npc.position),
        tileWidthFor: () => context.navigation.grid.tileWidth,
    })
}
