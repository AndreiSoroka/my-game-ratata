import type {
    CharacterSnapshot,
    ClientMessage,
    HeroClass,
    Vector2,
    WorldSnapshot,
} from '@my-game-ratata/contracts'

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
    getState: () => RatataTestState
    inventory: (open?: boolean) => void
    join: (nickname: string, heroClass?: HeroClass) => Promise<void>
    moveFor: (axis: Vector2, milliseconds: number) => Promise<void>
    send: (command: TestCommand) => void
    stop: () => void
}

interface TestInterfaceOptions {
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
    let movementTimer: ReturnType<typeof setTimeout> | undefined
    let finishMovement: (() => void) | undefined
    const cancelMovementTimer = () => {
        clearTimeout(movementTimer)
        movementTimer = undefined
        finishMovement?.()
        finishMovement = undefined
    }
    const stop = () => {
        cancelMovementTimer()
        options.send({ axis: { x: 0, y: 0 }, type: 'move_input' })
    }
    const send = (command: TestCommand) => {
        if (!options.getState().connected) {
            throw new Error('Join the game before sending commands')
        }
        if (command.type === 'move_input' || command.type === 'move_to') {
            cancelMovementTimer()
        }
        options.send(command)
    }
    const api: RatataTestApi = {
        getState: () => JSON.parse(JSON.stringify(options.getState())) as RatataTestState,
        inventory: options.inventory,
        join: async (nickname, heroClass) => {
            await options.join(nickname, heroClass)
            await waitForConnection(options.getState)
        },
        moveFor: (axis, milliseconds) => {
            if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 60_000) {
                return Promise.reject(new Error('Movement duration must be between 0 and 60000 ms'))
            }
            send({ axis, type: 'move_input' })
            return new Promise<void>((resolve) => {
                finishMovement = resolve
                movementTimer = setTimeout(stop, milliseconds)
            })
        },
        send,
        stop,
    }
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
            stop()
            window.removeEventListener('blur', stop)
            document.removeEventListener('visibilitychange', onHidden)
            if (window.__ratataTest === api) {
                delete window.__ratataTest
            }
        },
    }
}

async function waitForConnection(getState: () => RatataTestState): Promise<void> {
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
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
