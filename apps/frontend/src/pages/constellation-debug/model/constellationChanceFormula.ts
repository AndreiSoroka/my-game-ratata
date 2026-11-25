import type {
    ConstellationChanceFormula,
    ConstellationEffectChance,
} from './constellationChanceTypes'

/** Keep the legacy projection and the readable formula cards in agreement. */
export function withChanceFormulas(
    description: Omit<ConstellationEffectChance, 'formulas' | 'formulaDetails'>,
    details: ConstellationChanceFormula[]
): ConstellationEffectChance {
    return {
        ...description,
        formulas: details.map((formula) => formula.expression),
        formulaDetails: details.map((formula) => ({
            ...formula,
            variables: formula.variables.map((variable) => ({ ...variable })),
        })),
    }
}

export function chanceFormula(
    label: string,
    expression: string,
    variables: Record<string, string> = {}
): ConstellationChanceFormula {
    return {
        label,
        expression,
        variables: Object.entries(variables).map(([symbol, description]) => ({
            symbol,
            description,
        })),
    }
}
