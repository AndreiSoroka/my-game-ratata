import type {
    CharacterSnapshot,
    ClientMessage,
    HeroClass,
    Vector2,
    WorldSnapshot,
} from '@my-game-ratata/contracts'

import { stopAgentMovement } from './agentMovementStop'
import { createAgentNavigator } from './agentNavigation'
import { type AgentObservation, type ObservationOptions, observeGame } from './agentObservation'
import {
    type AgentActionOptions,
    type AgentCondition,
    type AgentWaitOptions,
    type AgentWaitResult,
    createAgentWaiter,
    validateAgentWait,
} from './agentWait'

export type TestCommand = Exclude<ClientMessage, { type: 'join' }>

export interface RatataTestState {
    connected: boolean
    defeated: boolean
    error: string
    inventoryOpen: boolean
    localPlayerId: string | undefined
    location: WorldSnapshot['location']
    notice: string
    player: CharacterSnapshot | undefined
    snapshot: WorldSnapshot | undefined
    status: string
}

export interface RatataTestApi {
    observe: () => AgentObservation
    navigate: ReturnType<typeof createAgentNavigator>['navigate']
    travel: ReturnType<typeof createAgentNavigator>['travel']
    act: (command: TestCommand, options?: AgentActionOptions) => Promise<AgentWaitResult>
    waitFor: (condition: AgentCondition, options?: AgentWaitOptions) => Promise<AgentWaitResult>
    getState: () => RatataTestState
    inventory: (open?: boolean) => void
    join: (nickname: string, heroClass?: HeroClass) => Promise<void>
    moveFor: (axis: Vector2, milliseconds: number) => Promise<void>
    send: (command: TestCommand) => void
    stop: () => void
}

interface TestInterfaceOptions {
    observation?: ObservationOptions
    getState: () => RatataTestState
    inventory: (open?: boolean) => void
    join: (nickname: string, heroClass?: HeroClass) => Promise<void>
    send: (command: TestCommand) => void
}

declare global {
    interface Window {
        __ratataTest?: RatataTestApi
    }
}

export function installTestInterface(options: TestInterfaceOptions): {
    api: RatataTestApi
    dispose: () => void
} {
    const driver = new TestDriver(options)
    const api = driver.api
    const stop = () => driver.stop()
    const onHidden = () => {
        if (document.hidden) {
            stop()
        }
    }
    window.__ratataTest = api
    window.addEventListener('blur', stop)
    document.addEventListener('visibilitychange', onHidden)
    return {
        api,
        dispose: () => {
            driver.dispose()
            window.removeEventListener('blur', stop)
            document.removeEventListener('visibilitychange', onHidden)
            if (window.__ratataTest === api) {
                delete window.__ratataTest
            }
        },
    }
}

class TestDriver {
    private movementTimer: ReturnType<typeof setTimeout> | undefined
    private finishMovement: (() => void) | undefined
    private disposed = false
    private readonly navigator: ReturnType<typeof createAgentNavigator>
    private readonly waiter: ReturnType<typeof createAgentWaiter>
    public readonly api: RatataTestApi

    public constructor(private readonly options: TestInterfaceOptions) {
        const observe = () => observeGame(options.getState(), options.observation)
        this.navigator = createAgentNavigator({
            getState: options.getState,
            observe,
            send: (command) => {
                if (!this.disposed) options.send(command)
            },
        })
        this.waiter = createAgentWaiter({ getState: options.getState, observe })
        this.api = {
            getState: () => JSON.parse(JSON.stringify(options.getState())) as RatataTestState,
            observe,
            inventory: (open) => {
                this.ensureActive()
                options.inventory(open)
            },
            join: async (name, heroClass) => {
                this.ensureActive()
                await options.join(name, heroClass)
                await waitForConnection(options.getState, () => this.disposed)
            },
            navigate: (destination, config) => {
                this.ensureActive()
                this.cancelMovementTimer()
                return this.navigator.navigate(destination, config)
            },
            travel: (direction, config) => {
                this.ensureActive()
                this.cancelMovementTimer()
                return this.navigator.travel(direction, config)
            },
            act: (command, config = {}) => {
                const afterTick = options.getState().snapshot?.tick ?? -1
                const condition = config.until ?? {
                    type: 'tick',
                    after: afterTick,
                }
                validateAgentWait(condition, config)
                this.send(command)
                return this.waiter.waitFor(
                    condition,
                    config,
                    config.until ? 'condition_met' : 'updated',
                    afterTick
                )
            },
            waitFor: (condition, config) => this.waiter.waitFor(condition, config),
            moveFor: (axis, milliseconds) => this.moveFor(axis, milliseconds),
            send: (command) => this.send(command),
            stop: () => this.stop(),
        }
    }

    private ensureActive(): void {
        if (this.disposed) throw new Error('Test interface has been disposed')
    }

    private cancelMovementTimer(): void {
        clearTimeout(this.movementTimer)
        this.movementTimer = undefined
        if (this.finishMovement && !this.disposed && this.options.getState().connected) {
            stopAgentMovement(this.options.getState(), this.options.send)
        }
        this.finishMovement?.()
        this.finishMovement = undefined
    }

    private send(command: TestCommand): void {
        this.ensureActive()
        if (!this.options.getState().connected)
            throw new Error('Join the game before sending commands')
        if ((command as ClientMessage).type === 'join')
            throw new Error('Use join() to create a player')
        if (
            ['move_input', 'move_to', 'follow', 'auto_attack', 'cancel_control'].includes(
                command.type
            )
        ) {
            this.cancelMovementTimer()
            this.navigator.cancel()
        }
        this.options.send(command)
    }

    private moveFor(axis: Vector2, milliseconds: number): Promise<void> {
        if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 60_000) {
            return Promise.reject(new Error('Movement duration must be between 0 and 60000 ms'))
        }
        if (
            !axis ||
            !Number.isFinite(axis.x) ||
            !Number.isFinite(axis.y) ||
            Math.abs(axis.x) > 1 ||
            Math.abs(axis.y) > 1
        ) {
            return Promise.reject(
                new Error('Movement axis must have finite components between -1 and 1')
            )
        }
        this.send({ axis, type: 'move_input' })
        return new Promise<void>((resolve) => {
            this.finishMovement = resolve
            this.movementTimer = setTimeout(() => this.releaseMovement(), milliseconds)
        })
    }

    public stop(): void {
        this.releaseMovement()
        this.waiter.cancel()
    }

    private releaseMovement(): void {
        this.cancelMovementTimer()
        this.navigator.cancel()
        if (!this.disposed && this.options.getState().connected) {
            stopAgentMovement(this.options.getState(), this.options.send)
        }
    }

    public dispose(): void {
        this.stop()
        this.disposed = true
        this.waiter.dispose()
    }
}

async function waitForConnection(
    getState: () => RatataTestState,
    disposed: () => boolean
): Promise<void> {
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
        if (disposed()) throw new Error('Test interface has been disposed')
        const state = getState()
        if (state.connected) {
            return
        }
        if (state.error.length > 0) {
            throw new Error(state.error)
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 50))
    }
    throw new Error('Timed out waiting for the game connection')
}
