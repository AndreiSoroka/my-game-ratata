import { createHash } from 'node:crypto'

const minimumDelayMs = 180_000
const maximumDelayMs = 300_000

interface RumorClockState {
    sequence: number
    dueAt?: number
}

export class SocialRumorClock {
    private readonly locations = new Map<string, RumorClockState>()

    public due(
        locationId: string,
        occupied: boolean,
        realNow: number
    ): boolean {
        const state = this.locations.get(locationId) ?? { sequence: 0 }
        this.locations.set(locationId, state)
        if (occupied) {
            delete state.dueAt
            return false
        }
        if (state.dueAt !== undefined && realNow < state.dueAt) {
            return false
        }
        const due = state.dueAt !== undefined
        const roll = socialRoll('round', locationId, String(++state.sequence))
        state.dueAt =
            realNow +
            minimumDelayMs +
            Math.floor(roll * (maximumDelayMs - minimumDelayMs + 1))
        return due
    }
}

export function socialRoll(...parts: string[]): number {
    return (
        createHash('sha256')
            .update(JSON.stringify(parts))
            .digest()
            .readUInt32BE(0) /
        2 ** 32
    )
}
