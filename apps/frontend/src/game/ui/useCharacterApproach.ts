import type {
    CharacterSnapshot,
    ClientMessage,
    Vector2,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import { nextTick, onBeforeUnmount, type Ref, watch } from 'vue'

import type { RatataGame } from '../runtime/ratataGame'

interface ApproachOptions {
    game: Ref<RatataGame | undefined>
    snapshot: Ref<WorldSnapshot | undefined>
    player: () => CharacterSnapshot | undefined
    selectedId: () => string | undefined
    blocked: () => boolean
    select: (id: string) => boolean
    canOpen: (id: string) => boolean
    open: (id: string) => void
}

interface Approach {
    id: string
    playerId: string
    locationId: string
    destination: Vector2
    startedAt: number
    sentAt: number
}

const interruptingCommands = new Set<ClientMessage['type']>([
    'auto_action',
    'auto_attack',
    'attack',
    'follow',
    'dash',
    'move_to',
    'release_input',
    'use_ability',
    'interact',
    'world_interact',
    'gather',
    'plant_tree',
    'farm_action',
    'pickup_item',
    'equipment_action',
    'inventory_action',
    'scenario_start',
])

export function useCharacterApproach(options: ApproachOptions) {
    let pending: Approach | undefined
    let sending = false

    function stop(): void {
        if (!pending) return
        pending = undefined
        options.game.value?.sendCommand({ type: 'cancel_control' })
    }

    function move(approach: Approach, position: Vector2, now: number): void {
        approach.destination = { ...position }
        approach.sentAt = now
        sending = true
        try {
            options.game.value?.sendCommand({ type: 'move_to', target: approach.destination })
        } finally {
            sending = false
        }
    }

    async function begin(id: string): Promise<void> {
        stop()
        if (options.blocked() || !options.select(id)) return
        await nextTick()
        const current = readTarget(options, id)
        if (!current) return
        if (options.canOpen(id)) {
            options.open(id)
            return
        }
        const { actor, player, snapshot } = current
        const locationId = snapshot.location?.id
        if (!actor.alive || !locationId || distance(player.position, actor.position) <= 32) return
        pending = {
            id,
            playerId: player.id,
            locationId,
            destination: actor.position,
            startedAt: snapshot.serverTime,
            sentAt: snapshot.serverTime,
        }
        move(pending, actor.position, snapshot.serverTime)
    }

    function advance(): void {
        if (!pending) return
        const approach = pending
        const current = readTarget(options, approach.id)
        if (!current || !canContinue(approach, current)) {
            stop()
            return
        }
        const { actor, player, snapshot } = current
        if (options.canOpen(approach.id)) {
            stop()
            options.open(approach.id)
            return
        }
        const waited = snapshot.serverTime - approach.sentAt
        if (waited >= 250 && distance(approach.destination, actor.position) >= 16) {
            move(approach, actor.position, snapshot.serverTime)
        } else if (routeStalled(player, waited)) {
            stop()
        }
    }

    function command(message: ClientMessage): void {
        if (sending || !pending) return
        if (message.type === 'cancel_control') pending = undefined
        else if (
            interruptingCommands.has(message.type) ||
            (message.type === 'move_input' && (message.axis.x !== 0 || message.axis.y !== 0))
        )
            stop()
    }

    watch([options.snapshot, options.selectedId, options.blocked], advance, { flush: 'post' })
    onBeforeUnmount(stop)
    return { begin, stop, command }
}

function readTarget(options: ApproachOptions, id: string) {
    const snapshot = options.snapshot.value
    const game = options.game.value
    const player = options.player()
    const actor = snapshot?.characters.find((entry) => entry.id === id)
    if (
        !snapshot ||
        !player?.alive ||
        player.cooldowns.stunMsLeft > 0 ||
        !actor ||
        options.blocked() ||
        options.selectedId() !== id ||
        !game?.canSelectTarget(`character:${id}`) ||
        !game.isInteractionVisible(actor.position, undefined, Infinity)
    )
        return undefined
    return { actor, player, snapshot }
}

function canContinue(
    approach: Approach,
    { actor, player, snapshot }: NonNullable<ReturnType<typeof readTarget>>
): boolean {
    return (
        actor.alive &&
        player.id === approach.playerId &&
        snapshot.location?.id === approach.locationId &&
        snapshot.serverTime - approach.startedAt < 12_000
    )
}

function distance(from: Vector2, to: Vector2): number {
    return Math.hypot(from.x - to.x, from.y - to.y)
}

function routeStalled(player: CharacterSnapshot, waited: number): boolean {
    const route = player.control?.route
    return waited >= 750 && (!route?.points.length || route.waiting === 'blocked')
}
