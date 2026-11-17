# Mastery calculation: developer reference

This reference is outside NPC retrieval. World-facing descriptions are in
[practice](../knowledge/development/practice.md) and
[constellations](../knowledge/development/stars.md); the character window and
atlas are documented in [character development](character-development.md).
The authoritative formulas, reward values and numeric representation are in
[`contracts/src/mastery.ts`](../contracts/src/mastery.ts). Change those shared
definitions and their behavioural checks together when intentionally changing
progression.

## Thresholds and representation

`masteryThreshold(L)` returns the cost of advancing from current level `L` to
`N = L + 1`. There is no authored gameplay level cap. The cost in human XP is
`min(100 × F_N, 100 × N^1.5)`, with `F_1 = F_2 = 1`. Fibonacci is cheaper through
target level 8; the power branch applies from the 8 → 9 transition. The first
costs are 100, 100, 200, 300, 500, 800, 1300, 2100 and 2700 XP.

Internal experience is integer micro-XP using `MASTERY_XP_SCALE`. The threshold
calculation rounds down at that precision; `masteryTotalExperience` sums the
thresholds from zero. `formatMasteryExperience` and `parseMasteryExperience`
carry exact decimal strings across JSON rather than serializing BigInts or
rounding accumulated experience through Number. Remainders survive level gains.

## Conflict and rewards

For the developed path's level `L`, total level `T` across all paths, and
`D = sum(max(0, otherLevel − L))`, `masteryConflict` returns:

```text
((L + 2) / (T + 2))^(2/3) × sqrt((L + 2) / (L + 2 + D))
```

One developed path retains its full reward. `masteryRewardMicros` applies the
multiplier to an eligible base reward and rounds to integer micro-XP. Eligibility,
frozen per-action factors and repeat protection are enforced by the shared
progression services in
[`skillProgression.ts`](../apps/backend/src/game/skillProgression.ts).

`MASTERY_REWARDS` is the single numeric reward table;
`masteryRewardsForConstellation` selects the relevant entries for UI calculations.
This reference links that table instead of maintaining another copy of every hit,
teaching, healing and ritual reward. Level progression supplies openings; the
actual known stars determine effects and available actions.

Regression coverage lives in
[mastery progression](../apps/backend/tests/mastery-progression.test.ts),
[action rewards](../apps/backend/tests/mastery-action-rewards.test.ts) and
[skill progression](../apps/backend/tests/skill-progression.test.ts).
