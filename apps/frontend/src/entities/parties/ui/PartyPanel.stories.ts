import {
    CENTER_LOCATION_ID,
    type PartyMemberSnapshot,
    type PartySnapshot,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import PartyPanel from './PartyPanel.vue'

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
function party(members: PartyMemberSnapshot[]): PartySnapshot {
    return {
        partyId: 'party',
        leaderId: 'mira',
        members,
        invitations: [],
        jobs: [],
        activeJobs: [],
        notice: null,
    }
}

type Args = { party: PartySnapshot; selectedId?: string; currentLocationId?: string }
const meta = {
    title: 'Entities/parties/PartyPanel',
    parameters: { backgrounds: { disable: false } },
    args: {
        party: party([
            member('ignat', 'Игнат', 67),
            member('mira', 'Мира', 100),
            member('vera', 'Вера', 82),
        ]),
        currentLocationId: CENTER_LOCATION_ID,
        selectedId: 'mira',
    },
    render: (args) => {
        const host = renderVueStory(PartyPanel, { ...args })
        host.style.maxWidth = '268px'
        return host
    },
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {}
export const DownedMember: Story = {
    args: { party: party([member('mira', 'Мира', 74), member('vera', 'Вера', 0)]) },
}
export const OtherLocation: Story = {
    args: {
        party: party([
            member('mira', 'Мира', 100),
            member('ignat', 'Игнат', 37, {
                locationId:
                    WORLD_LOCATION_DEFINITIONS.find(
                        (location) => location.id !== CENTER_LOCATION_ID
                    )?.id ?? CENTER_LOCATION_ID,
            }),
        ]),
    },
}
