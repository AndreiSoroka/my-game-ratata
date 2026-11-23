import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import type { AdminAccessState } from '../model/useWorldAdministration'
import AdminAccess from './AdminAccess.vue'

interface StoryArgs {
    access: AdminAccessState
    busy: boolean
    error: string
}

const meta = {
    title: 'Pages/StartGame/AdminAccess',
    args: { access: 'code', busy: false, error: '' },
    argTypes: {
        access: { control: 'select', options: ['checking', 'code', 'unavailable', 'authorized'] },
        busy: { control: 'boolean' },
        error: { control: 'text' },
    },
    render: (args) => renderVueStory(AdminAccess, { ...args }, { background: '#172820' }),
} satisfies Meta<StoryArgs>
export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}
export const LocalChecking: Story = { args: { access: 'checking' } }
export const Authorized: Story = { args: { access: 'authorized' } }
export const CodeError: Story = {
    args: { error: 'Код не принят. Проверьте код или получите новый в терминале сервера.' },
}
