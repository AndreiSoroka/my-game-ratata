import { type PrayerAbilityId } from '@my-game-ratata/contracts'

import { chanceFormula } from './constellationChanceFormula'
import { prayerSchoolInfo } from './constellationPrayerScenario'

const quality =
    'Множитель силы от настроения: 1,3 при благосклонности; 1 при нейтральном настроении; 0,65 при гневе.'
const answer =
    'Шанс успешной молитвы в процентах: 80 при благосклонности, 55 при нейтральном настроении, 25 при гневе.'
const roll =
    'Один общий случайный бросок завершённой молитвы: от 0 включительно до 1 не включительно.'
const learned = (name: string) => `1, если изучена звезда «${name}»; иначе 0.`

export function prayerAnswerFormula(ability?: PrayerAbilityId) {
    const label =
        ability === 'pray'
            ? 'Шанс лечения, %'
            : ability === 'pray_road'
              ? 'Шанс восстановления энергии, %'
              : ability === 'pray_lantern'
                ? 'Шанс восстановления маны, %'
                : ability === 'pray_grave'
                  ? 'Шанс лечения нежити, %'
                  : 'Шанс молитвы, %'
    return chanceFormula(label, 'B', {
        B: '80 при благосклонности; 55 при нейтральном настроении; 25 при гневе. Уровень мастерства не меняет вероятность.',
    })
}
export function prayerRestorationFormula(ability: PrayerAbilityId) {
    const info = prayerSchoolInfo[ability]
    return chanceFormula(
        `Восстановление ${info.resource} при ответе`,
        `min(N, round(${info.basePower} × Q × M))`,
        {
            N: `Недостающий запас ${info.resource} у получателя в момент разрешения молитвы.`,
            Q: quality,
            M:
                ability === 'pray'
                    ? 'Множитель из формулы «Множитель лечения».'
                    : '1: модификаторы созвездия «Молитва» на эту школу не действуют.',
        }
    )
}
export function prayerHealingMultiplierFormula() {
    return chanceFormula('Множитель лечения', '1 + 0,05 × A + 0,05 × D + 0,10 × E', {
        A: learned('Тёплый дар'),
        D: learned('Щедрый дар'),
        E: '1, если изучен «Последний огонёк», до исцеления HP молящегося ниже 20%, порог пересечён из-за вражеского удара и остались учтённые вражеские раны; иначе 0.',
    })
}
export function prayerPurificationFormula() {
    return chanceFormula('Шанс шага очищения, %', 'min(95, 20 × P / 55)', { P: answer })
}
export function prayerHarmFormula() {
    return chanceFormula('Шанс кары, %', 'min(95, P + 20)', { P: answer })
}
export function prayerHarmPowerFormula() {
    return chanceFormula('Урон кары до поглощения', 'round(6 × Q × M)', {
        Q: quality,
        M: 'Множитель из формулы «Множитель урона кары».',
    })
}
export function prayerHarmMultiplierFormula() {
    return chanceFormula('Множитель урона кары', '1 + 0,30 × A + 0,30 × D', {
        A: learned('Суровый ответ'),
        D: learned('Гнев небес'),
    })
}
export function prayerAnswerRollFormula() {
    return chanceFormula('Условие успеха', 'r < P / 100', { r: roll, P: answer })
}
export function prayerHarmRollFormula() {
    return chanceFormula('Условие кары для каждой подходящей цели', 'r < H / 100', {
        r: roll,
        H: 'Шанс кары в процентах из формулы «Шанс кары».',
    })
}
export function prayerPurificationRollFormula() {
    return chanceFormula('Условие шага каждой подходящей могилы', 'r < G / 100', {
        r: roll,
        G: 'Шанс шага в процентах из формулы «Шанс шага очищения».',
    })
}
export function prayerModifierFormula() {
    return chanceFormula('Применение изученного модификатора при его условиях, %', '100')
}
export function prayerRadiusFormula() {
    return chanceFormula('Радиус молитвы, px', '48 + W × (A + D)', {
        W: 'Ширина одной клетки текущей карты в мировых пикселях.',
        A: learned('Дальний голос'),
        D: learned('Голос над долиной'),
    })
}
export function prayerFocusFormula() {
    return chanceFormula('Длительность канала молитвы, мс', 'round(3000 × (1 − 0,10 × A))', {
        A: learned('Сосредоточение'),
    })
}
export function prayerLowHpFormula() {
    return chanceFormula('Порог здоровья «Последнего огонька» до исцеления', 'H < 0,20 × N', {
        H: 'HP молящегося перед исцелением.',
        N: 'Максимальное HP молящегося.',
    })
}
export function prayerRevivalChanceFormula() {
    return chanceFormula('Шанс воскрешения, %', 'P', { P: answer })
}
export function prayerRevivalHpFormula() {
    return chanceFormula('HP после успешного воскрешения', 'max(1, ceil(N × 0,5))', {
        N: 'Максимальное HP воскрешаемой цели.',
    })
}
export function prayerRevivalResourceFormula() {
    return chanceFormula('MP и EN после успешного воскрешения', '0,5 × N', {
        N: 'Максимальный запас соответствующего ресурса цели: маны или энергии.',
    })
}
export function prayerInsightFormula() {
    return chanceFormula('Раскрытие информации после изучения, %', '100')
}
export function prayerMoodTimerFormula() {
    return chanceFormula('До следующей смены настроения, мс', '30000 − (T mod 30000)', {
        T: 'Текущее авторитетное серверное время в миллисекундах; атлас его не считывает.',
    })
}
