export interface ConstellationChanceFormula {
    label: string
    expression: string
    variables: Array<{ symbol: string; description: string }>
}

export interface ConstellationEffectChance {
    /** The node only changes a rule; it has no additional random outcome to explain. */
    deterministic?: boolean
    summary: string
    formulas: string[]
    examples: Array<{ label: string; value: string }>
    notes: string[]
    formulaDetails?: ConstellationChanceFormula[]
}
