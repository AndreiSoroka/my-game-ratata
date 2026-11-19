/** The CSS variables are the single source of actual light-theme color values. */
export const lightUiColors = {
    border: {
        white: 'var(--ui-light-border-white)',
        cream: 'var(--ui-light-border-cream)',
        gold: 'var(--ui-light-border-gold)',
        copper: 'var(--ui-light-border-copper)',
    },
    panel: {
        parchment: 'var(--ui-light-panel-parchment)',
        title: 'var(--ui-light-panel-title)',
        text: 'var(--ui-light-panel-text)',
        muted: 'var(--ui-light-panel-muted)',
        divider: 'var(--ui-light-panel-divider)',
        warning: 'var(--ui-light-panel-warning)',
    },
    button: {
        text: 'var(--ui-light-button-text)',
        textHover: 'var(--ui-light-button-text-hover)',
        edge: 'var(--ui-light-button-edge)',
        focus: 'var(--ui-light-button-focus)',
        textShadow: 'var(--ui-light-button-text-shadow)',
        shadow: 'var(--ui-light-button-shadow)',
        pressedShadow: 'var(--ui-light-button-pressed-shadow)',
        selectedEdge: 'var(--ui-light-button-selected-edge)',
        wood: {
            top: 'var(--ui-light-button-wood-top)',
            bottom: 'var(--ui-light-button-wood-bottom)',
            hoverTop: 'var(--ui-light-button-wood-hover-top)',
            hoverBottom: 'var(--ui-light-button-wood-hover-bottom)',
        },
        primary: {
            top: 'var(--ui-light-button-primary-top)',
            bottom: 'var(--ui-light-button-primary-bottom)',
            hoverTop: 'var(--ui-light-button-primary-hover-top)',
            hoverBottom: 'var(--ui-light-button-primary-hover-bottom)',
        },
        success: {
            top: 'var(--ui-light-button-success-top)',
            bottom: 'var(--ui-light-button-success-bottom)',
            hoverTop: 'var(--ui-light-button-success-hover-top)',
            hoverBottom: 'var(--ui-light-button-success-hover-bottom)',
        },
        danger: {
            top: 'var(--ui-light-button-danger-top)',
            bottom: 'var(--ui-light-button-danger-bottom)',
            hoverTop: 'var(--ui-light-button-danger-hover-top)',
            hoverBottom: 'var(--ui-light-button-danger-hover-bottom)',
        },
        slot: {
            top: 'var(--ui-light-button-slot-top)',
            bottom: 'var(--ui-light-button-slot-bottom)',
            hoverTop: 'var(--ui-light-button-slot-hover-top)',
            hoverBottom: 'var(--ui-light-button-slot-hover-bottom)',
        },
    },
} as const
