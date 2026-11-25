import { describe, expect, it } from 'vitest'

import { createKnowledgeSelectionStore } from './knowledgeSelection'

describe('knowledge participant selection', () => {
    it('keeps separate panel choices and uses only candidates still in the current snapshot', () => {
        const learner = createKnowledgeSelectionStore()
        const spellTarget = createKnowledgeSelectionStore()
        const available = [{ id: 'first' }, { id: 'next' }]

        learner.select('next')
        expect(learner.current(available)?.id).toBe('next')
        expect(spellTarget.current(available)?.id).toBe('first')
        expect(learner.current([{ id: 'first' }])?.id).toBe('first')
        expect(learner.current([])).toBeUndefined()
    })
})
