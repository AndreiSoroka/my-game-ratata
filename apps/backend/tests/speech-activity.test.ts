import { expect, it, vi } from 'vitest'

import { parseClientMessage } from '../src/game/messages'
import { SpeechActivityService } from '../src/game/speechActivity'
import { exchangeFixture } from './exchangeFixture'

function fixture() {
    const f = exchangeFixture()
    const world = {
        getCharacter: (id: string) =>
            id === f.a.id ? f.a : id === f.b.id ? f.b : undefined,
        navigationFor: () => f.navigation,
    }
    return { ...f, service: new SpeechActivityService(world) }
}
it('projects presence with ttl and matching cancellation, never speech contents', () => {
    const f = fixture()
    f.service.handle(
        f.a,
        {
            type: 'speech_activity',
            active: true,
            activityId: 'old',
            channel: 'say',
        },
        0
    )
    expect(f.service.snapshot(f.b, 3999)).toEqual([
        { actorId: f.a.id, id: 'old', kind: 'typing' },
    ])
    expect(f.service.snapshot(f.b, 4000)).toEqual([])
    f.service.handle(
        f.a,
        {
            type: 'speech_activity',
            active: true,
            activityId: 'new',
            channel: 'say',
        },
        5000
    )
    f.service.handle(
        f.a,
        {
            type: 'speech_activity',
            active: false,
            activityId: 'old',
            channel: 'say',
        },
        5001
    )
    expect(f.service.snapshot(f.a, 5002)[0]?.id).toBe('new')
    f.service.handle(
        f.a,
        {
            type: 'speech_activity',
            active: false,
            activityId: 'new',
            channel: 'say',
        },
        5003
    )
    expect(f.service.snapshot(f.a, 5004)).toEqual([])
})
it.each(['distance', 'location', 'death', 'disconnect', 'wall'] as const)(
    'revokes private presence after %s',
    (reason) => {
        const f = fixture()
        f.service.handle(
            f.a,
            {
                type: 'speech_activity',
                active: true,
                activityId: 'private',
                channel: 'whisper',
                targetId: f.b.id,
            },
            0
        )
        expect(f.service.snapshot(f.b, 1)).toHaveLength(1)
        if (reason === 'distance') {
            f.b.position.x += 49
        }
        if (reason === 'location') {
            f.b.locationId = 'map-0-0'
        }
        if (reason === 'death') {
            f.a.alive = false
        }
        if (reason === 'disconnect') {
            f.a.connected = false
        }
        if (reason === 'wall') {
            vi.spyOn(f.navigation, 'hasLineOfSight').mockReturnValue(false)
        }
        expect(f.service.snapshot(f.b, 2)).toEqual([])
    }
)
it('rejects malformed presence and parses an exact focus hint without client names', () => {
    expect(
        parseClientMessage(
            JSON.stringify({
                type: 'speech_activity',
                active: true,
                activityId: 'a',
                channel: 'whisper',
            })
        ).error
    ).toBeDefined()
    expect(
        parseClientMessage(
            JSON.stringify({
                type: 'chat',
                text: 'Это что?',
                focusKey: 'world:well',
                name: 'Лужа',
            })
        ).message
    ).toEqual({ type: 'chat', text: 'Это что?', focusKey: 'world:well' })
})
