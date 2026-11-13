import type {
    AdventureClientMessage,
    AdventureResourceNode,
    AdventureSnapshot,
    AdventureTradeItemId,
    GameEventPayload,
} from '@my-game-ratata/contracts'
import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'

import {
    adventureDialogue,
    adventureQuest,
    adventureShop,
    dragonStory,
    isQuestTrophyTarget,
} from './adventureContent'
import { resolveAdventureNpc } from './adventureNpc'
import { adventureRecipes, AdventureResources } from './adventureResources'
import {
    applyAdventureChoice,
    createAdventureState,
    type PlayerAdventure,
} from './adventureState'
import { purchaseAdventureItem, refreshTradeDialogue } from './adventureTrading'
import type { GameCharacter } from './character'
import { materialSnapshot } from './materialInventory'
import type { NavigationService } from './navigation'
import { setNotice } from './notices'
import { trophyDialogue, trophyProgress } from './trophyQuest'
import type { WorldObjectDefinition } from './worldObjectData'
import { WorldObjects } from './worldObjects'

interface AdventureServiceOptions {
    now?: () => number
    resourceNodes?: AdventureResourceNode[]
    worldObjects?: WorldObjectDefinition[]
}

export class AdventureService {
    private readonly players = new Map<string, PlayerAdventure>()
    private readonly observedDeaths = new WeakMap<GameCharacter, number>()
    private readonly resources: AdventureResources
    private readonly worldObjects: WorldObjects
    private readonly now: () => number

    public constructor(options: AdventureServiceOptions = {}) {
        this.resources = new AdventureResources(options.resourceNodes)
        this.worldObjects = new WorldObjects(options.worldObjects)
        this.now = options.now ?? Date.now
    }

    public snapshot(
        playerId: string,
        locationId: string = CENTER_LOCATION_ID,
        actor?: GameCharacter
    ): AdventureSnapshot {
        const state = this.stateFor(playerId)
        const progress = trophyProgress(
            state,
            actor?.id === playerId ? actor : undefined
        )

        return structuredClone({
            dialogue: trophyDialogue(state.dialogue, progress),
            worldObjects: this.worldObjects.snapshot(locationId),
            farmPlots: this.resources.snapshotFarms(locationId, this.now()),
            gold: state.gold,
            materials: materialSnapshot(
                actor?.id === playerId ? actor : undefined
            ),
            recipes: adventureRecipes,
            resourceNodes: this.resources
                .snapshot()
                .filter((node) => node.locationId === locationId),
            notice: state.notice,
            noticeId: state.noticeId,
            quest: {
                ...adventureQuest,
                kills: state.kills,
                status: progress.questStatus,
            },
            shop: adventureShop,
            trophies: progress.trophies,
            wardRestored: state.wardRestored,
        })
    }

    public grantGoldOnce(
        playerId: string,
        amount: number,
        rewardId: string
    ): boolean {
        const state = this.stateFor(playerId)
        if (
            !Number.isSafeInteger(amount) ||
            amount <= 0 ||
            state.rewardKeys.has(rewardId)
        ) {
            return false
        }
        state.rewardKeys.add(rewardId)
        state.gold += amount
        setNotice(state, `Гильдия выплатила ${String(amount)} золотых.`)
        return true
    }

    public handle(
        actor: GameCharacter,
        message: AdventureClientMessage,
        locationNPCs: GameCharacter[],
        navigation?: NavigationService
    ): GameEventPayload[] {
        switch (message.type) {
            case 'world_interact':
                return this.worldObjects.interact(
                    actor,
                    this.stateFor(actor.id),
                    message.objectId,
                    navigation,
                    this.now()
                )
            case 'interact':
                return this.interact(actor, message.targetId, locationNPCs)
            case 'dialogue_choice':
                return this.choose(actor, message.choiceId, locationNPCs)
            case 'trade':
                return this.trade(actor, message.itemId, locationNPCs)
            case 'gather':
            case 'farm_action':
            case 'craft':
                return this.resources.handle(
                    actor,
                    this.stateFor(actor.id),
                    message,
                    this.now()
                )
        }
    }

    public interact(
        actor: GameCharacter,
        npcId: string,
        locationNPCs: GameCharacter[]
    ): GameEventPayload[] {
        const state = this.stateFor(actor.id)
        const npc = resolveAdventureNpc(actor, npcId, locationNPCs, this.now())

        if (npc === undefined) {
            return this.reject(
                state,
                'Подойди к живому собеседнику ближе: не дальше 48 шагов.'
            )
        }

        setNotice(state, null)
        state.dialogue = adventureDialogue(
            npc.id,
            npc.nickname,
            trophyProgress(state, actor)
        )
        this.refreshTradeAccess(actor)
        return this.say(actor, npc, state.dialogue.text)
    }

    public choose(
        actor: GameCharacter,
        choiceId: string,
        locationNPCs: GameCharacter[]
    ): GameEventPayload[] {
        const state = this.stateFor(actor.id)

        if (choiceId === 'leave' || choiceId === 'close') {
            state.dialogue = null
            setNotice(state, null)
            return []
        }

        const npc = resolveAdventureNpc(
            actor,
            state.dialogue?.npcId,
            locationNPCs,
            this.now()
        )

        if (npc === undefined) {
            return this.reject(
                state,
                'Разговор прерван. Вернись к собеседнику.'
            )
        }

        const dialogue = adventureDialogue(
            npc.id,
            npc.nickname,
            trophyProgress(state, actor)
        )

        if (!dialogue.choices.some((choice) => choice.id === choiceId)) {
            return this.reject(state, 'Этот ответ сейчас недоступен.')
        }

        applyAdventureChoice(state, choiceId, actor)
        const text = choiceId === 'ask_dragon' ? dragonStory : undefined
        state.dialogue = adventureDialogue(
            npc.id,
            npc.nickname,
            trophyProgress(state, actor),
            text
        )
        this.refreshTradeAccess(actor)
        return this.say(actor, npc, state.dialogue.text)
    }

    public trade(
        actor: GameCharacter,
        itemId: AdventureTradeItemId,
        locationNPCs: GameCharacter[]
    ): GameEventPayload[] {
        const state = this.stateFor(actor.id)
        const npc = resolveAdventureNpc(
            actor,
            state.dialogue?.npcId,
            locationNPCs,
            this.now()
        )
        return purchaseAdventureItem(actor, state, npc, itemId)
    }

    public trySpendGold(playerId: string, amount: number): boolean {
        const state = this.stateFor(playerId)
        if (
            !Number.isSafeInteger(amount) ||
            amount <= 0 ||
            state.gold < amount
        ) {
            return false
        }
        state.gold -= amount
        return true
    }

    public refreshTradeAccess(actor: GameCharacter): void {
        refreshTradeDialogue(actor, this.stateFor(actor.id).dialogue)
    }

    public observe(
        events: GameEventPayload[],
        findCharacter: (id: string) => GameCharacter | undefined
    ): GameEventPayload[] {
        for (const event of events) {
            if (event.kind === 'permadeath' && event.actorId !== undefined) {
                this.players.delete(event.actorId)
                this.worldObjects.forgetActor(event.actorId)
            }

            if (event.kind === 'death') {
                this.observeDeath(event, findCharacter)
            }
        }

        return []
    }

    private observeDeath(
        event: GameEventPayload,
        findCharacter: (id: string) => GameCharacter | undefined
    ): void {
        const actor =
            event.actorId === undefined
                ? undefined
                : findCharacter(event.actorId)
        const target =
            event.targetId === undefined
                ? undefined
                : findCharacter(event.targetId)

        if (actor === undefined || target === undefined) {
            return
        }

        if (
            !isQuestTrophyTarget(actor, target) ||
            this.observedDeaths.get(target) === target.deathSequence
        ) {
            return
        }

        this.observedDeaths.set(target, target.deathSequence)
        const state = this.stateFor(actor.id)

        if (state.questStatus !== 'active') {
            return
        }

        state.kills += 1
        setNotice(
            state,
            'Враждебный слизень повержен. Подбери выпавшее сердце с земли.'
        )
    }

    private reject(state: PlayerAdventure, notice: string): GameEventPayload[] {
        setNotice(state, notice)
        return []
    }

    private say(
        actor: GameCharacter,
        npc: GameCharacter,
        text: string
    ): GameEventPayload[] {
        return [{ actorId: npc.id, kind: 'chat', targetId: actor.id, text }]
    }

    private stateFor(playerId: string): PlayerAdventure {
        let state = this.players.get(playerId)

        if (state === undefined) {
            state = createAdventureState()
            this.players.set(playerId, state)
        }

        return state
    }
}
