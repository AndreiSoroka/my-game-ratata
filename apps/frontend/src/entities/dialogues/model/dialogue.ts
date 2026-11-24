export interface DialogueChoice {
    readonly id: string
    readonly label: string
}

export interface DialogueNeighbor {
    readonly key: string
    readonly name: string
}

export interface DialogueNeighbors {
    readonly left?: DialogueNeighbor | undefined
    readonly right?: DialogueNeighbor | undefined
}
