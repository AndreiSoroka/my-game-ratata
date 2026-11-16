export function speechBubbleId(actorId: string, receipt: string | number = 'active'): string {
    return `speech-${actorId}-${receipt}`
}
