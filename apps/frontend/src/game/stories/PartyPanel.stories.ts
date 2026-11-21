import '../ui/rpgControls.css'

import {
    CENTER_LOCATION_ID,
    type PartyMemberSnapshot,
    type PartySnapshot,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import PartyPanel from '../ui/PartyPanel.vue'
import { renderVueStory } from './renderVueStory'

const meta = { title: 'Game/PartyPanel' } satisfies Meta
export default meta
type Story = StoryObj

function member(
    id: string,
    nickname: string,
    hpPercent: number,
    extra: Partial<PartyMemberSnapshot> = {}
): PartyMemberSnapshot {
    return {
        id,
        nickname,
        hpPercent,
        alive: hpPercent > 0,
        online: true,
        locationId: CENTER_LOCATION_ID,
        ...extra,
    }
}
function panel(members: PartyMemberSnapshot[]): HTMLElement {
    const party: PartySnapshot = {
        partyId: 'party',
        leaderId: 'mira',
        members,
        invitations: [],
        jobs: [],
        activeJob: null,
        notice: null,
    }
    return renderVueStory(PartyPanel, { party, currentLocationId: CENTER_LOCATION_ID })
}

export const Leader: Story = {
    render: () =>
        panel([
            member('ignat', 'Игнат', 67),
            member('mira', 'Мира', 100),
            member('vera', 'Вера', 82),
        ]),
}
export const DownedMember: Story = {
    render: () => panel([member('mira', 'Мира', 74), member('vera', 'Вера', 0)]),
}
export const OtherLocation: Story = {
    render: () =>
        panel([
            member('mira', 'Мира', 100),
            member('ignat', 'Игнат', 37, {
                locationId:
                    WORLD_LOCATION_DEFINITIONS.find(
                        (location) => location.id !== CENTER_LOCATION_ID
                    )?.id ?? CENTER_LOCATION_ID,
            }),
        ]),
}
