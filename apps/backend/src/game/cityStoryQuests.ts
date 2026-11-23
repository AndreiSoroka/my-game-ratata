import {
    authoredMessage,
    authoredRussian,
    type CityBellState,
    DEFAULT_QUEST_REWARD_MODE,
    type QuestDraft,
} from '@my-game-ratata/contracts'

import { adventureQuest } from './adventureContent'
import type { AdventureChoiceContext, PlayerAdventure } from './adventureState'
import type { GameCharacter } from './character'
import {
    type CityStoryDefinition,
    cityStoryDefinitions,
} from './cityStoryDefinitions'
import type { CityWorldState } from './cityWorldState'
import type { InventoryItemInstance } from './inventory'
import { resetMartyrStreak } from './martyr'
import { setAuthoredNotice } from './notices'
import type { QuestFunding } from './questFunding'
import { planQuestReward, type QuestGoldAwarder } from './questRewards'
import { availableInventoryQuantity } from './rewardReservations'

const finished = 'story.finished'

export class CityStoryQuests {
    private readonly consumedHearts: InventoryItemInstance[] = []

    public constructor(
        private readonly cities: CityWorldState,
        private readonly players: Map<string, PlayerAdventure>,
        private readonly funding: QuestFunding,
        private readonly award: QuestGoldAwarder,
        private readonly walletFor: (id: string) => PlayerAdventure
    ) {}

    public initialize(seed: string, initialBellState?: CityBellState): void {
        this.cities.configure(seed, initialBellState)
        for (const definition of cityStoryDefinitions) {
            if (
                this.cities.snapshot(definition.cityId)?.bellState !== 'silent'
            ) {
                continue
            }
            const wallet = this.funding.wallet(definition.cityId)
            if (
                wallet === undefined ||
                !this.funding.reservations.reserve(
                    reservationId(definition),
                    { inventory: [], wallet },
                    definition.rewardGold,
                    []
                )
            ) {
                throw new Error('The city story budget cannot be reserved')
            }
        }
    }

    public synchronize(state: PlayerAdventure): void {
        const definition = this.cities.byQuest(adventureQuest.id)
        const city =
            definition === undefined
                ? undefined
                : this.cities.snapshot(definition.cityId)
        if (city === undefined) {
            return
        }
        state.cityBellState = city.bellState
        state.wardRestored = city.bellState === 'active'
        if (
            city.bellState !== 'silent' &&
            (state.questStatus === 'available' ||
                state.questStatus === 'active')
        ) {
            state.questStatus = 'cancelled'
            const reason =
                state.questAccepted === true
                    ? finished
                    : city.bellState === 'active'
                      ? 'story.bellActive'
                      : 'story.bellPrepared'
            state.questCancelledReason = authoredRussian(reason)
            state.questCancelledReasonMessage = authoredMessage(reason)
        }
    }

    public available(
        issuer: GameCharacter,
        recipientId: string,
        questId: string
    ): string | undefined {
        const definition = this.cities.byQuest(questId)
        const state = this.walletFor(recipientId)
        this.synchronize(state)
        return definition?.issuerId !== issuer.id ||
            definition.cityId !== issuer.locationId ||
            this.cities.snapshot(definition.cityId)?.bellState !== 'silent' ||
            state.questStatus !== 'available'
            ? 'Этот городской заказ уже выполнен или недоступен.'
            : undefined
    }

    public draft(questId: string): QuestDraft | undefined {
        const definition = this.cities.byQuest(questId)
        return definition === undefined
            ? undefined
            : {
                  authoredId: definition.questId,
                  title: definition.title,
                  description: definition.description,
                  objectives: [
                      {
                          kind: 'deliver',
                          itemId: definition.requiredItemId,
                          quantity: definition.quantity,
                          recipientId: definition.issuerId,
                      },
                  ],
                  rewardGold: definition.rewardGold,
                  rewardItems: [],
                  funding: 'city',
              }
    }

    public choose(
        state: PlayerAdventure,
        choiceId: string,
        actor: GameCharacter,
        context: AdventureChoiceContext
    ): boolean {
        const definition = this.cities.byQuest(adventureQuest.id)
        if (definition === undefined) {
            return false
        }
        this.synchronize(state)
        if (choiceId === 'accept_quest') {
            this.accept(state, actor, definition, context)
        }
        if (choiceId === 'turn_in_trophies') {
            this.turnIn(state, actor, definition, context)
        }
        if (choiceId === 'restore_ward') {
            setAuthoredNotice(state, 'story.restore')
        }
        return true
    }

    public accept(
        state: PlayerAdventure,
        _actor: GameCharacter,
        definition: CityStoryDefinition,
        context: AdventureChoiceContext
    ): boolean {
        if (
            this.cities.snapshot(definition.cityId)?.bellState !== 'silent' ||
            state.questStatus !== 'available'
        ) {
            setAuthoredNotice(state, finished)
            return false
        }
        state.questStatus = 'active'
        state.questAccepted = true
        state.questRewardMode = context.rewardMode ?? DEFAULT_QUEST_REWARD_MODE
        setAuthoredNotice(state, 'story.cityAccepted')
        return true
    }

    private turnIn(
        state: PlayerAdventure,
        actor: GameCharacter,
        definition: CityStoryDefinition,
        context: AdventureChoiceContext
    ): void {
        if (this.cities.snapshot(definition.cityId)?.bellState !== 'silent') {
            this.synchronize(state)
            setAuthoredNotice(state, finished)
            return
        }
        if (state.questStatus !== 'active') {
            return
        }
        const items = selectHearts(actor, definition)
        if (items === undefined) {
            setAuthoredNotice(state, 'story.heartsRequired')
            return
        }
        const request = {
            receiptId: `city-story:${definition.cityId}:${definition.questId}`,
            totalGold: definition.rewardGold,
            mode: state.questRewardMode ?? DEFAULT_QUEST_REWARD_MODE,
            submitterId: actor.id,
            memberIds: context.memberIds ?? [actor.id],
        }
        const shares = planQuestReward(request)
        const wallet = this.funding.wallet(definition.cityId)
        if (shares === undefined || wallet === undefined) {
            return
        }
        const result = this.award(request, {
            assets: {
                reservationId: reservationId(definition),
                items: [
                    {
                        from: actor.inventory,
                        to: this.consumedHearts,
                        items,
                        capacity: Infinity,
                    },
                ],
                gold: shares.map((share) => ({
                    from: wallet,
                    to: this.walletFor(share.characterId),
                    amount: share.gold,
                })),
            },
        })
        if (!result.ok) {
            setAuthoredNotice(state, 'story.rewardUnavailable')
            return
        }
        state.questStatus = 'completed'
        state.questRewardShares = result.shares
        state.rewardKeys.add(definition.questId)
        this.cities.prepare(definition.cityId)
        this.funding.reservations.release(reservationId(definition))
        for (const other of this.players.values()) {
            this.synchronize(other)
        }
        resetMartyrStreak(actor)
        setAuthoredNotice(state, 'story.cityReward')
    }
}

function reservationId(definition: CityStoryDefinition): string {
    return `city-story-budget:${definition.cityId}:${definition.questId}`
}

function selectHearts(actor: GameCharacter, definition: CityStoryDefinition) {
    let remaining = definition.quantity
    const result: Array<{ instanceId: string; quantity: number }> = []
    for (const item of actor.inventory) {
        if (item.itemId !== definition.requiredItemId || remaining === 0) {
            continue
        }
        const quantity = Math.min(
            remaining,
            availableInventoryQuantity(actor.inventory, item.instanceId)
        )
        if (quantity > 0) {
            result.push({ instanceId: item.instanceId, quantity })
        }
        remaining -= quantity
    }
    return remaining === 0 ? result : undefined
}
