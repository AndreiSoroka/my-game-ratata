import type { Preview } from '@storybook/web-components-vite'

const preview: Preview = {
    parameters: {
        a11y: {
            test: 'todo',
        },
        controls: {
            matchers: {
                color: /(background|color)$/i,
                date: /Date$/i,
            },
        },
        layout: 'fullscreen',
    },
}

export default preview
