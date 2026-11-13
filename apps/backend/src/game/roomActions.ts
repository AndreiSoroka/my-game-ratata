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
import type { CompanionService } from './companions'
import { isAdventureCommand } from './extraCommands'
import { handleMovementCommand } from './movementActions'
import { handleDashWithFeedback } from './movementFeedback'
import type { NavigationService } from './navigation'
import type { PartyService } from './parties'
import { handleProgressionCommand } from './progressionCommands'
import type { TheftService } from './theft'
import { isTheftCommand } from './theftCommands'
import type { WorldInventory } from './worldInventory'

interface ActionContext {
    requestAbilityAttack?: AbilityContext['requestAbilityAttack']
    theft: TheftService
    adventure: AdventureService
    allCharacters: Iterable<GameCharacter>
    parties: PartyService
    characters: GameCharacter[]
    companions: CompanionService
    inventory: WorldInventory
    message: ClientMessage
    navigation: NavigationService
    now: number
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
            now
        )
    }
    if (message.type === 'companion_request') {
        return context.companions.handle(player, message, characters, now)
    }
    if (isProgressionCommand(message)) {
        const events = handleProgressionCommand(player, message, {
            characters,
            navigation: context.navigation,
            now,
        })
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
    const { message, player, characters, now } = context
    if (message.type === 'revive') {
        return handleAbilityCommand(
            player,
            {
                type: 'use_ability',
                abilityId: 'pray',
                intent: { mode: 'revive', targetId: message.targetId },
            },
            { characters, navigation: context.navigation, now }
        )
    }
    if (message.type === 'use_ability' || message.type === 'learn_ability') {
        const events = handleAbilityCommand(player, message, {
            characters,
            navigation: context.navigation,
            now,
            ...(context.requestAbilityAttack === undefined
                ? {}
                : { requestAbilityAttack: context.requestAbilityAttack }),
        })
        return [
            ...events,
            ...context.inventory.dropLootForDeaths(events, (id) =>
                characters.find((character) => character.id === id)
            ),
        ]
    }

    return undefined
}
