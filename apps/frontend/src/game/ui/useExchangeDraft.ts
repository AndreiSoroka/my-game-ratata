import type {
    CharacterSnapshot,
    ClientMessage,
    ExchangeItemQuantity,
    ExchangeSnapshot,
} from '@my-game-ratata/contracts'
import { computed, ref, watch } from 'vue'

import { createRandomId } from '@/shared/lib/random-id'

interface PendingProposal {
    id: string
    fingerprint: string
    edited: boolean
}
interface DraftProps {
    exchange: ExchangeSnapshot
    player: CharacterSnapshot
    gold: number
}
type Command = (message: ClientMessage) => void
type DraftState = ReturnType<typeof createDraftState>
const normalizedItems = (items: ExchangeItemQuantity[]) =>
    [...items].sort((left, right) => left.instanceId.localeCompare(right.instanceId))
const fingerprint = (items: ExchangeItemQuantity[], gold: number) =>
    JSON.stringify([normalizedItems(items), gold])

function createDraftState(props: DraftProps) {
    const quantities = ref<Record<string, number>>({})
    const mode = ref<'editing' | 'review' | 'reopened'>('editing')
    const gold = ref(0),
        pending = ref<PendingProposal>(),
        error = ref('')
    const confirming = ref<Pick<ExchangeSnapshot, 'id' | 'revision'>>()
    const withdrawing = ref<string>()
    const availableGold = computed(() => props.exchange.ownAvailability?.gold ?? props.gold)
    const available = computed(
        () =>
            new Map(
                props.exchange.ownAvailability?.items.map((item) => [
                    item.instanceId,
                    item.quantity,
                ]) ?? props.player.inventory.map((item) => [item.instanceId, item.quantity ?? 1])
            )
    )
    const items = computed(() =>
        Object.entries(quantities.value)
            .filter(([, quantity]) => quantity > 0)
            .map(([instanceId, quantity]) => ({ instanceId, quantity }))
    )
    const local = computed(() => fingerprint(items.value, gold.value))
    const server = computed(() =>
        fingerprint(
            props.exchange.own.items.map((item) => ({
                instanceId: item.instanceId,
                quantity: item.quantity ?? 1,
            })),
            props.exchange.own.gold
        )
    )
    const dirty = computed(() => local.value !== server.value)
    const valid = computed(
        () =>
            Number.isSafeInteger(gold.value) &&
            gold.value >= 0 &&
            gold.value <= availableGold.value &&
            items.value.every(
                (item) =>
                    Number.isSafeInteger(item.quantity) &&
                    item.quantity <= (available.value.get(item.instanceId) ?? 0)
            )
    )
    return {
        quantities,
        mode,
        gold,
        pending,
        error,
        availableGold,
        available,
        items,
        local,
        server,
        dirty,
        valid,
        confirming,
        withdrawing,
    }
}
function canAct(props: DraftProps, state: DraftState): boolean {
    return (
        props.exchange.status === 'active' &&
        state.confirming.value === undefined &&
        state.withdrawing.value === undefined
    )
}
function editable(props: DraftProps, state: DraftState): boolean {
    return canAct(props, state) && !props.exchange.own.accepted && state.mode.value !== 'review'
}
function installConsentSync(props: DraftProps, state: DraftState): void {
    watch(
        [
            () => props.exchange.id,
            () => props.exchange.status,
            () => props.exchange.revision,
            () => props.exchange.own.accepted,
        ],
        ([id, status, revision, accepted]) => {
            const active = status === 'active'
            if (accepted) state.mode.value = 'review'
            const confirmation = state.confirming.value
            if (
                confirmation &&
                (confirmation.id !== id ||
                    !active ||
                    accepted ||
                    confirmation.revision !== revision)
            ) {
                state.confirming.value = undefined
            }
            const withdrawingHere = state.withdrawing.value === id && active
            if (!withdrawingHere || !accepted) {
                state.withdrawing.value = undefined
                if (withdrawingHere) state.mode.value = 'reopened'
            }
        }
    )
}
function hasPublishedOffer(own: ExchangeSnapshot['own']): boolean {
    return (
        own.accepted ||
        own.items.length > 0 ||
        own.gold > 0 ||
        (own.lastRequestId !== undefined && !own.requestError)
    )
}
function reset(props: DraftProps, state: DraftState): void {
    state.quantities.value = Object.fromEntries(
        props.exchange.own.items.map((item) => [item.instanceId, item.quantity ?? 1])
    )
    state.gold.value = props.exchange.own.gold
}
function installDraftSync(props: DraftProps, state: DraftState): void {
    let previousId: string | undefined
    let previousServer = ''
    watch(
        [
            () => props.exchange.id,
            () => props.exchange.own.revision ?? 0,
            () => props.exchange.own.lastRequestId,
        ],
        () => {
            const changedExchange = previousId !== props.exchange.id
            const wasDirty = state.local.value !== previousServer
            const own = props.exchange.own
            const pending = state.pending.value
            if (changedExchange) {
                state.mode.value = hasPublishedOffer(own) ? 'review' : 'editing'
                reset(props, state)
                state.pending.value = undefined
                state.error.value = own.requestError ?? ''
            } else if (pending && own.lastRequestId === pending.id) {
                if (
                    !pending.edited &&
                    !own.requestError &&
                    state.server.value === pending.fingerprint
                ) {
                    state.mode.value = 'review'
                }
                state.pending.value = undefined
                state.error.value = own.requestError ?? ''
            } else if (!pending && !wasDirty) {
                reset(props, state)
            }
            previousId = props.exchange.id
            previousServer = state.server.value
        },
        { immediate: true }
    )
    watch(
        state.local,
        (local) => {
            const pending = state.pending.value
            if (pending && local !== pending.fingerprint) {
                pending.edited = true
            }
        },
        { flush: 'sync' }
    )
}
function sendProposal(
    props: DraftProps,
    state: DraftState,
    command: Command,
    canResubmit: boolean
): void {
    if (!editable(props, state) || !state.valid.value || state.pending.value) return
    if (!state.dirty.value && !canResubmit) return
    const requestId = createRandomId()
    state.pending.value = { id: requestId, fingerprint: state.local.value, edited: false }
    state.error.value = ''
    command({
        type: 'exchange_offer',
        exchangeId: props.exchange.id,
        revision: props.exchange.own.revision ?? 0,
        requestId,
        items: normalizedItems(state.items.value),
        gold: state.gold.value,
    })
}
function requestChanges(props: DraftProps, state: DraftState, command: Command): void {
    if (!canAct(props, state) || state.mode.value !== 'review') return
    if (!props.exchange.own.accepted) {
        state.mode.value = 'reopened'
        return
    }
    state.withdrawing.value = props.exchange.id
    command({
        type: 'exchange_decline',
        exchangeId: props.exchange.id,
        revision: props.exchange.revision,
        reason: 'Хочу изменить предложение.',
    })
}
function createDraftActions(props: DraftProps, state: DraftState, command: Command) {
    const canResubmit = computed(
        () =>
            editable(props, state) &&
            !state.dirty.value &&
            (state.mode.value === 'reopened' || hasPublishedOffer(props.exchange.own))
    )
    const empty = computed(
        () =>
            props.exchange.own.items.length === 0 &&
            props.exchange.other.items.length === 0 &&
            props.exchange.own.gold === 0 &&
            props.exchange.other.gold === 0
    )
    const canConfirm = computed(
        () =>
            canAct(props, state) &&
            !state.dirty.value &&
            state.valid.value &&
            state.pending.value === undefined &&
            !props.exchange.own.accepted &&
            !empty.value
    )
    return {
        change: (instanceId: string, quantity: number) => {
            if (editable(props, state)) {
                state.quantities.value = { ...state.quantities.value, [instanceId]: quantity }
            }
        },
        changeGold: (gold: number) => {
            if (editable(props, state)) state.gold.value = gold
        },
        all: () => {
            if (!editable(props, state)) {
                return
            }
            state.quantities.value = Object.fromEntries(
                props.player.inventory.map((item) => [
                    item.instanceId,
                    state.available.value.get(item.instanceId) ?? 0,
                ])
            )
        },
        clear: () => {
            if (editable(props, state)) state.quantities.value = {}
        },
        propose: () => sendProposal(props, state, command, canResubmit.value),
        canResubmit,
        canConfirm,
        empty,
        editing: computed(() => editable(props, state)),
        edit: () => requestChanges(props, state, command),
        confirm: () => {
            if (canConfirm.value) {
                state.mode.value = 'review'
                state.confirming.value = {
                    id: props.exchange.id,
                    revision: props.exchange.revision,
                }
                command({
                    type: 'exchange_accept',
                    exchangeId: props.exchange.id,
                    revision: props.exchange.revision,
                })
            }
        },
    }
}
export function useExchangeDraft(props: DraftProps, command: Command) {
    const state = createDraftState(props)
    installDraftSync(props, state)
    installConsentSync(props, state)
    return { ...state, ...createDraftActions(props, state, command) }
}
