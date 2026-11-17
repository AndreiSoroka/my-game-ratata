import type {
    CharacterSnapshot,
    ClientMessage,
    ExchangeItemQuantity,
    ExchangeSnapshot,
} from '@my-game-ratata/contracts'
import { computed, ref, watch } from 'vue'

interface PendingProposal {
    id: string
    revision: number
    fingerprint: string
}
interface PendingConsent {
    exchangeId: string
    revision: number
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
    const gold = ref(0),
        pending = ref<PendingProposal>(),
        error = ref('')
    const confirming = ref<PendingConsent>()
    const withdrawing = ref<PendingConsent>()
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
function editable(props: DraftProps, state: DraftState): boolean {
    return (
        props.exchange.status === 'active' &&
        !props.exchange.own.accepted &&
        state.confirming.value === undefined &&
        state.withdrawing.value === undefined
    )
}
function installConsentSync(props: DraftProps, state: DraftState): void {
    watch(
        [
            () => props.exchange.id,
            () => props.exchange.status,
            () => props.exchange.revision,
            () => props.exchange.own.accepted,
        ],
        () => {
            const confirmation = state.confirming.value
            if (
                confirmation &&
                (props.exchange.id !== confirmation.exchangeId ||
                    props.exchange.status !== 'active' ||
                    props.exchange.own.accepted ||
                    props.exchange.revision !== confirmation.revision)
            ) {
                state.confirming.value = undefined
            }
            const withdrawal = state.withdrawing.value
            if (
                withdrawal &&
                (props.exchange.id !== withdrawal.exchangeId ||
                    props.exchange.status !== 'active' ||
                    !props.exchange.own.accepted)
            ) {
                state.withdrawing.value = undefined
            }
        }
    )
}
function acknowledged(props: DraftProps, pending: PendingProposal | undefined): boolean {
    return pending !== undefined && props.exchange.own.lastRequestId === pending.id
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
            const received = acknowledged(props, state.pending.value)
            const matchesAcknowledgement =
                received &&
                state.local.value === state.pending.value?.fingerprint &&
                state.server.value === state.local.value
            if (changedExchange || !wasDirty || matchesAcknowledgement) {
                reset(props, state)
            }
            if (changedExchange || received) {
                state.pending.value = undefined
                state.error.value = props.exchange.own.requestError ?? ''
            }
            previousId = props.exchange.id
            previousServer = state.server.value
        },
        { immediate: true }
    )
}
function sendProposal(props: DraftProps, state: DraftState, command: Command): void {
    if (
        !editable(props, state) ||
        !state.dirty.value ||
        !state.valid.value ||
        state.pending.value !== undefined
    ) {
        return
    }
    const requestId = crypto.randomUUID()
    const revision = props.exchange.own.revision ?? 0
    state.pending.value = { id: requestId, revision, fingerprint: state.local.value }
    state.error.value = ''
    command({
        type: 'exchange_offer',
        exchangeId: props.exchange.id,
        revision,
        requestId,
        items: normalizedItems(state.items.value),
        gold: state.gold.value,
    })
}
function requestChanges(props: DraftProps, state: DraftState, command: Command): void {
    if (
        props.exchange.status !== 'active' ||
        !props.exchange.own.accepted ||
        state.withdrawing.value ||
        state.confirming.value
    ) {
        return
    }
    state.withdrawing.value = { exchangeId: props.exchange.id, revision: props.exchange.revision }
    command({
        type: 'exchange_decline',
        exchangeId: props.exchange.id,
        revision: props.exchange.revision,
        reason: 'Хочу изменить предложение.',
    })
}
function createDraftActions(props: DraftProps, state: DraftState, command: Command) {
    const empty = computed(
        () =>
            props.exchange.own.items.length === 0 &&
            props.exchange.other.items.length === 0 &&
            props.exchange.own.gold === 0 &&
            props.exchange.other.gold === 0
    )
    const canConfirm = computed(
        () =>
            editable(props, state) &&
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
            if (editable(props, state)) {
                state.gold.value = gold
            }
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
            if (editable(props, state)) {
                state.quantities.value = {}
            }
        },
        propose: () => sendProposal(props, state, command),
        canConfirm,
        empty,
        editing: computed(() => editable(props, state)),
        edit: () => requestChanges(props, state, command),
        confirm: () => {
            if (canConfirm.value) {
                state.confirming.value = {
                    exchangeId: props.exchange.id,
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
