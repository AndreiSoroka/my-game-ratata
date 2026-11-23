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
            context.navigation,
            now
        )
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
