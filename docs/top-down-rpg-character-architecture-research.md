# Универсальная архитектура персонажа для фэнтези RPG

## Главный вывод

Для твоего кейса лучший путь — **не строить один гигантский “бог-объект”**, а сделать **один универсальный корневой агрегат персонажа** с **единой точкой управления**, внутри которого живут расширяемые подсистемы: атрибуты, эффекты, способности, перемещение, развитие, память и ссылки на социальную систему. Это соответствует тому, как современные игровые архитектуры отделяют **сущность** от **данных и систем**: в ECS сущность — это идентификатор, а поведение реализуют системы над компонентами; в Unreal повторно используемое поведение выносится в компоненты; в Godot сложные объекты собираются композиционно из узлов и сцен. Для RPG и мультиплеера такой подход масштабируется лучше, чем глубокая иерархия наследования. citeturn15view2turn24view0turn24view1turn18view0

Практически это означает следующее: на бекенде нужен **один интерфейс `Character`**, который одинаково подходит для локального игрока, удалённого игрока, NPC, бота и сюжетного скрипта, но **источник решений** должен быть вынесен наружу. Иначе ты очень быстро смешаешь в одном классе ввод, сетевую синхронизацию, AI, эффекты, инвентарь, квесты, репутацию и драматургию. Лучшие практики мультиплеера при этом однозначно тянут тебя к **server-authoritative** модели: сервер должен быть источником истины для позиции, боя, инвентаря, статусов и результатов способностей; клиенты и AI-слои формируют только намерения и запросы. Unity прямо описывает силу server authority как централизованное разрешение конфликтов состояния, Godot рекомендует серверную авторитетность для gameplay-critical решений, а Unreal исходит из того, что именно сервер имеет authority над реплицируемыми объектами. citeturn15view0turn15view1turn18view3turn18view4

Из этого следует жёсткое архитектурное правило: **у персонажа должен быть один и тот же доменный API для всех режимов управления**, а различаться должен только **контроллер**, который генерирует команды. Человек нажимает кнопки, удалённый клиент присылает команды по сети, NPC-логика выбирает действие, сценарий квеста делает принудительный вызов — но всё это превращается в один и тот же набор доменных команд вроде `move`, `moveTo`, `useAbility`, `interact`, `receiveEffect`, `takeDamage`, `rest`, `eat`, `remember`, `changeRelation`. Такой дизайн даёт тебе одинаковое поведение по сети для игроков и NPC не “по обещанию”, а потому что они реально проходят через одну и ту же серверную модель. citeturn15view1turn18view4turn18view0

## Чем должен быть персонаж на бекенде

На уровне домена персонаж лучше трактовать как **aggregate root** с ограниченным набором собственных обязанностей. Его задача — принимать намерения, валидировать их, обновлять состояние и выпускать доменные события. А вот конкретные подсистемы лучше держать внутри как отдельные модули или структуры. Это совпадает и с ECS-подходом, где код систем отделён от данных сущности, и с компонентной моделью Unreal, где abstract behaviors вроде movement, inventory или attribute management выносятся в `ActorComponent`. citeturn15view2turn24view0

Для твоей top-down fantasy RPG у универсального персонажа должны быть как минимум такие доменные блоки:

**Идентичность и мета** — `id`, вид сущности, фракции, архетип, раса, пол, шаблон спавна, флаги вроде `isPlayerControllable`, `isNetworkReplicated`, `isSummon`, `isStoryCritical`.

**Пространство и движение** — позиция, скорость, текущий режим локомоции, facing, коллизии, тип перемещения, запрос на путь, активный путь, текущая цель движения, последняя навигационная ошибка.

**Атрибуты** — HP, mana, energy, stamina, armor, move speed, attack speed, carry capacity, perception, vision radius, stealth detect radius, food/sleep/rest needs и любые производные значения. Практически полезно разделять **base** и **current** значение атрибута, как это делает Unreal GAS: base нужно для долгоживущих изменений, current — для расчётов с временными эффектами. citeturn18view2turn15view5

**Набор эффектов и состояний** — не как россыпь булевых флагов, а как список активных эффектов плюс иерархические теги состояния. Unreal прямо показывает, что иерархические gameplay tags хорошо подходят для описания концептов, а gameplay effects — для мгновенных и длительных изменений атрибутов. Это особенно хорошо ложится на RPG, где почти всё выражается как “тег + модификатор + правило снятия”. citeturn15view4turn15view5turn18view0

**Способности** — реестр способностей, требования, кулдауны, стоимость ресурсов, блокирующие/разрешающие теги, уровень мастерства, а также ссылки на data-driven definition. Unreal GAS полезен здесь именно как эталонная мысль: Actor получает abilities, attributes, effects и tags как отдельные, но согласованные подсистемы; при этом сервер выдаёт и отзывает способности. citeturn18view0turn18view1turn15view3

**Развитие** — не выбор игроком “ветки по кнопке”, а набор внутренних mastery-треков, которые растут от фактического использования. То есть не “класс паладин взял талант за очко”, а “меч, щит, уворот, концентрация, пиромантия, алхимия, выживание” как независимые направления, из которых затем автоматически открываются новые техники и пассивы.

**Память и журнал** — краткосрочная operational memory для AI, долгосрочная эпизодическая память о событиях, и технический action log последних действий. Для RPG это не роскошь: исследования по NPC-памяти и репутации специально подчеркивают важность persistent memories, beliefs, forgetting и knowledge transfer между NPC, а не мгновенного “все всё знают”. citeturn25view0turn16view3

Важно, что **навигация не должна быть зашита внутрь персонажа как алгоритм мира**. Персонаж должен иметь метод `moveTo`, но сам поиск пути лучше делегировать `NavigationService`, потому что путь зависит от мира, геометрии, препятствий и правил конкретной карты. Это ещё и лучше для синхронизации: сервер считает путь, персонаж исполняет результат. Для 2D-игр Godot явно разделяет grid-based и mesh-based navigation: `AStar2D`/`AStarGrid2D` хороши для дискретных клеток, а `NavigationServer2D` — для свободного перемещения в области. Временные препятствия и вес разных точек тоже естественно живут в навигационном сервисе, а не внутри character-класса. citeturn19view2turn19view0turn19view1turn19view3turn18view7

## Как объединить игрока, сетевого игрока, NPC и скрипт

Правильная абстракция здесь — **не “тип персонажа”**, а **“тип контроллера”**. Сам персонаж должен быть один и тот же. Различаются только источники намерений:

- локальный человек;
- удалённый игрок по сети;
- utility/BT/GOAP AI;
- scripted director или quest logic;
- тестовый автопилот или replay system.

Это особенно важно для мультиплеера. Godot прямо предупреждает, что если отдавать клиенту авторитет по позиции, бою или инвентарю, это повышает шанс читов и десинков; Unity описывает server authority как механизм для разрешения конфликтов состояния; Unreal разделяет authority и replication-rules на уровне самих акторов. Значит, удалённый игрок и NPC **не должны иметь два разных доменных класса** — они должны иметь **один и тот же `Character`**, над которым разные контроллеры вызывают те же команды. citeturn15view1turn15view0turn18view3turn18view4

На бекенде это лучше оформлять так: контроллер выдаёт **intent**, персонаж превращает intent в **validated domain action**, затем публикуются **events**, а уже потом наружная система реплицирует snapshot. В терминах сети это даёт чистое разделение:

**Команды и intents** — `move axis`, `requestMoveTo`, `beginCast`, `cancelCast`, `interact`, `equip`, `eat`, `rest`.

**Состояние** — позиция, скорость, HP, mana, energy, tags, cooldowns, active effects, current path target.

**События** — урон, смерть, начало/конец эффекта, агро, смена цели, открытие способности, провал pathfinding, изменение репутации.

Такой split хорошо согласуется и с Unreal, где свойства, которые часто меняются, уместно реплицировать как properties, а одноразовые события передавать как RPC, и с server-authoritative сетевой практикой в целом. citeturn18view4turn15view0turn15view1

Для top-down игры я бы рекомендовал две разные команды движения. Первая — **непосредственное движение**: `move(direction)`, где direction — нормализованный вектор или оси WASD/стика. Вторая — **целевая навигация**: `moveTo(point)`, которую могут использовать и AI, и клик-мув, и скрипты. При этом обход препятствий должен быть частью навигационной подсистемы. В Godot AStar-точки можно временно отключать для препятствий и задавать им разные веса стоимости; mesh- и server-based навигация лучше подходит для свободных зон и real-time avoidance. Для top-down fantasy это даёт хороший критерий выбора: если у тебя бой и движение работают “по клеткам” или по явной сетке — бери weighted grid, если мир свободный и плотный — навмеш/навигационный сервер. citeturn19view0turn19view1turn19view2turn19view3

Отдельно стоит отметить отзывчивость. Если у тебя есть клиентский ввод, то UX иногда требует локального предвосхищения движения или анимации. Unity Netcode for GameObjects прямо оговаривает, что полную prediction/reconciliation он не даёт, но даёт client anticipation для визуального опережения результата сервера. Для твоего запроса это важно ровно в одном месте: **в бекенд-модели не надо смешивать domain-truth и клиентскую отзывчивость**. Пусть на сервере живёт строгая правда, а на клиенте — anticipatory presentation layer. citeturn18view5turn15view0

## Эффекты, способности и развитие

Самая сильная идея, которую стоит взять из RPG-практик и GAS-подобных систем, — это разделение на **attributes**, **effects**, **abilities** и **tags**. Атрибуты отвечают за численные значения, эффекты — за их изменения во времени, способности — за действия и правила активации, теги — за семантику и совместимость. В Unreal gameplay attributes описывают любые float-oriented характеристики, gameplay effects меняют attributes мгновенно или длительно, а gameplay tags дают иерархические лейблы, которыми удобно блокировать, разрешать и маркировать поведение. Для расширяемой бэкенд-RPG это почти идеальный ориентир. citeturn18view2turn15view5turn15view4turn18view1

Для списка состояний полезно взять **D&D как вдохновение для нормализованной таксономии**, но не копировать буквально весь ruleset. В D&D conditions — это стандартные состояния, меняющие возможности существа. Базовый список включает blinded, charmed, deafened, exhaustion, frightened, grappled, incapacitated, invisible, paralyzed, petrified, poisoned, prone, restrained, stunned и unconscious. Также официальные basic rules отдельно дают модели darkvision, потребности в еде/воде и long rest. Это хороший сигнал, какие вещи действительно стоит сделать самостоятельными доменными понятиями в RPG-движке. citeturn21view0turn15view8turn15view9turn15view11

Практически я бы организовал эффекты так не как “список всех возможных дебаффов”, а как **слои доменных смыслов**:

**Сенсорные состояния** — ослепление, глухота, истинное зрение, эхолокация, ночное зрение, эфирное видение, невидимость, обнаружимость.

**Контроль и agency** — очарование, страх, оглушение, incapacitated, silence, taunt, confuse, berserk, sleep.

**Мобильность** — grappled, restrained, prone, paralyzed, rooted, slowed, hastened, flying, swimming, phasing, teleport lock.

**Телесность и форма** — poisoned, petrified, bleeding, burning, freezing, cursed, diseased, ethereal body, incorporeal, undead physiology.

**Выживание и экология** — hunger, thirst, fatigue, rest debt, suffocation, heat/cold tolerance, disease resistance, poison immunity.

**Социальные и ментальные модификаторы** — morale up/down, loyalty, panic, trust shift, intimidation, shame, zeal.

Таксономически это лучше держать в формате `tag + stack policy + modifier list + lifecycle rules`, а не через жёсткую россыпь полей. Теги вида `state.cc.stunned`, `state.form.ethereal`, `need.food.starving`, `sense.vision.darkvision`, `movement.rooted` масштабируются намного лучше, чем `isStunned`, `isEthereal`, `needsFood`, `hasDarkVision` с ручной логикой в сотне мест. Эта идея прямо перекликается с hierarchical tags в Unreal. citeturn15view4turn15view5turn21view0

Со способностями логика похожая. Способность должна быть **данными**, а не жёстким кодом персонажа. Персонаж хранит только выданные ему ability instances и их runtime-state: заряд, кулдаун, уровень мастерства, текущий execution-state, ссылки на активные эффекты. Всё остальное — target rules, costs, tags, combo-links, unlock-conditions — должно жить в definition-слое. Это повторяет то, как Unreal Ability System позволяет выдавать и отзывать abilities сервером и как effects даже могут временно grant-ить способности. Для твоего проекта это особенно важно, потому что список способностей “должен легко расширяться”. citeturn18view1turn10search2turn15view5

С развитием через использование лучше идти не в “дерево, которое выбирает игрок вручную”, а в **latent mastery graph**. Я бы делал так: есть семейства мастерства — `weapon.sword`, `combat.block`, `magic.fire`, `survival.endurance`, `social.intimidation`, `craft.alchemy`. Любое meaningful use генерирует `UsageSignal`. Сигнал добавляет опыт в семейство, но только если действие было **контекстно значимым**. И вот здесь нужна фильтрация, иначе игрок будет качать меч, пиная по крысам у города часами. Полезная практика — считать опыт с поправкой на challenge, novelty, success quality и diminishing returns. Исследования по challenge design для RPG подчеркивают, что вызов должен соответствовать навыку игрока, расти по мере прогресса, а динамические коррекции не должны убивать чувство достижения. Отсюда следует хороший дизайн-вывод: use-based рост должен награждать **осмысленное мастерство в условиях реального риска**, а не тупой фарм повторений. Это уже мой вывод, но он хорошо опирается на рекомендации GameFlow и анализ сложности в RPG. citeturn22view1turn15view12

## Репутация, отношения, память и предыстория

Репутацию и отношения действительно лучше **вынести в отдельную подсистему**, а не засовывать в основной Character-класс как несколько полей `reputation`, `friendship`, `hate`. Причина простая: отношения — это почти всегда **граф рёбер между агентами**, а не локальное свойство одного персонажа. Исследование по динамике социальных отношений NPC прямо говорит, что социальные отношения обычно представляют конечным набором переменных, и выделяет как минимум четыре важные оси: **liking, dominance, solidarity и familiarity**. Это уже очень хороший фундамент для отдельного `CharacterRelations` или `SocialGraph` слоя. citeturn16view4

В терминах модели это означает, что у персонажа должно быть только **`socialRef`** или `socialAgentId`, а все реальные отношения должны храниться в отдельном сервисе/агрегате:

- отношение `A -> B`;
- отношение `B -> A`;
- репутация игрока глазами конкретного NPC;
- доверие между NPC;
- личная история взаимодействий;
- принадлежность к фракциям;
- отношение к событийному классу вроде “вор”, “герой”, “осквернитель”, “охотник на драконов”.

Такой разнос особенно полезен потому, что репутация в живом мире не должна быть одним глобальным числом “карма +12”. AAAI-работа по NPC reputation systems критикует модели, где после события все NPC мгновенно узнают о нём, и вводит гораздо более реалистичные требования: beliefs, communications, updates, spatial and temporal constraints, reliability, persistence, relationships, trust и goals. Более того, репутация там выражается **для каждого NPC независимо**, а знания о событиях могут приходить как через собственное наблюдение, так и через общение с другими NPC. Для RPG с миром сверху это очень сильная практика: не “мир знает”, а “конкретные акторы знают или думают, что знают”. citeturn25view0turn16view3

Из этого вытекает ещё одно важное правило: **предыстория и память — это не одно и то же**. Предыстория — относительно статичный narrative profile: происхождение, травмы, клятвы, принадлежность к культу, прежняя профессия, отношения до старта игры. Память — это динамический журнал событий: что персонаж видел, слышал, кому доверяет, кого боится, какие события считает важными, что уже забыл. Для интерактивного сторителлинга это разделение давно полезно: работы по character-based storytelling и dialogue generation подчёркивают ценность явного представления backstory, character information, relationship information и дальнейшего procedural использования этого слоя в динамике сцены и диалога. citeturn23view0turn23view1

На практике я бы делил память минимум на три слоя. **Operational memory** — краткосрочные факты для текущего AI-цикла: “вижу игрока”, “слышу шум справа”, “моя цель скрылась”. **Episodic memory** — события с временной меткой, местом, свидетелями, эмоциональной окраской и надёжностью. **Social memory** — кто кому что сказал, кто видел проступок, кто является авторитетным свидетелем, кто может распространять слухи. AAAI-модель репутации особенно полезна здесь тем, что прямо закладывает forgetting, trust, indirect experience, witness-based knowledge и spatial-temporal spread. Это даёт тебе реалистичную основу для репутации драконов, городов, стражи, банд и культов. citeturn25view0turn16view3

## Матрицы поведения для агрессии, бегства и мотивации

Если нужен практический AI-подход, который реально поможет в RPG и не убьёт тебя на масштабе, то лучший стек здесь — **hybrid AI**. На верхнем уровне — **utility selection** для выбора “что сейчас выгоднее”, на среднем — **behavior tree** для структурированного исполнения реактивного поведения, а для сложных целевых задач — **GOAP/планирование**. Для pathfinding — отдельный navigation service. Такой гибрид не случаен: BT получили распространение потому, что FSM масштабируются плохо и неудобны в расширении; utility AI хорош для data-driven оценок по нормализованным параметрам; GOAP хорошо работает там, где персонажу нужно составлять последовательность действий к цели; F.E.A.R. вообще показателен тем, что использовал маленькую FSM и планирование последовательностей действий поверх A*. citeturn17view0turn16view5turn17view1

Для utility AI особенно полезна одна практика: **все considerations нормализовать в интервал `[0..1]`**, а затем прогонять через response curves. Game AI Pro прямо описывает схему, где decision score evaluator собирает несколько considerations, каждая consideration нормализуется, ремапится кривой и затем комбинируется в итоговый score; в качестве примеров используются target health и distance to target. Это почти дословно ложится на твой запрос про “дракон агрессивен, если репутация ниже N, настроение ниже Y, злость выше C”. В utility-системе это просто разные кривые и веса. citeturn16view5

Ниже — **предлагаемая модель**, не как “единственно верная формула”, а как пригодная стартовая схема.

### Матрица агрессии дракона

Сделай несколько непрерывных показателей:

- `repHostilityToTarget` — насколько плохо дракон относится именно к этой цели;
- `moodAggressionBias` — общий боевой фон настроения;
- `anger` — накопленная злость;
- `fear` — осторожность/испуг;
- `territoryViolation` — вторглась ли цель в гнездо, сокровищницу, зону сна;
- `hungerDrive` — голод или охотничий импульс;
- `powerConfidence` — оценка “я сильнее их или нет”;
- `damageRecentlyTaken` — сколько боли дракон получил недавно;
- `storyConstraint` — запрет атаковать по сюжету или наоборот принуждение.

Тогда:

```text
AggroScore =
  0.24 * curveLow(repHostilityToTarget)
+ 0.14 * curveHigh(anger)
+ 0.12 * curveHigh(territoryViolation)
+ 0.10 * curveHigh(hungerDrive)
+ 0.12 * curveHigh(damageRecentlyTaken)
+ 0.10 * curveHigh(powerConfidence)
+ 0.08 * curveHigh(moodAggressionBias)
- 0.10 * curveHigh(fear)
+ 0.20 * storyConstraint
```

Пороговая политика может быть такой:

- `>= 0.75` — немедленная атака;
- `0.50..0.75` — угроза, демонстрация силы, приближение, предупреждение;
- `0.30..0.50` — слежение, рычание, занять выгодную позицию;
- `< 0.30` — нейтралитет или игнорирование.

Почему это работает: utility AI как раз и предназначен для выбора действий по нескольким нормализованным численным considerations, а эмоциональные appraisal-модели полезны как модуль, который делает настроение, страх, злость и т. п. не случайными флагами, а внутренними драйверами поведения. citeturn16view5turn17view2

### Матрица бегства NPC

Для бегства лучше не смотреть только на HP. Иначе AI будет выглядеть тупо. Нужны минимум:

- `selfHpRatio`;
- `staminaOrEnergyRatio`;
- `incomingDpsEstimate`;
- `allySupportRatio`;
- `escapeRouteQuality`;
- `fear`;
- `loyaltyToGoal`;
- `discipline`;
- `valueOfStaying` — насколько важна точка, объект, лидер, квест.

```text
FleeScore =
  0.22 * curveLow(selfHpRatio)
+ 0.10 * curveLow(staminaOrEnergyRatio)
+ 0.18 * curveHigh(incomingDpsEstimate)
+ 0.12 * curveLow(allySupportRatio)
+ 0.14 * curveHigh(fear)
+ 0.10 * curveHigh(crowdControlPressure)
+ 0.08 * curveHigh(escapeRouteQuality)
- 0.12 * curveHigh(loyaltyToGoal)
- 0.10 * curveHigh(discipline)
- 0.12 * curveHigh(valueOfStaying)
```

Затем можно развести реакции по порогам:

- высокий `FleeScore` и хороший выход — отступать;
- высокий `FleeScore`, но плохой выход — искать cover, звать помощь, использовать defensive ability;
- средний `FleeScore` — kite, держать дистанцию, пить зелье, бафаться;
- низкий `FleeScore` — продолжать бой.

Такой дизайн лучше обычной FSM-таблицы именно потому, что utility даёт плавный переход между состояниями, а BT затем уже оформляет конкретную последовательность “отойти → найти безопасную точку → применить heal → переоценить ситуацию”. Модульность BT по сравнению с разрастающимися FSM подтверждается обзорной литературой, а utility-подход хорошо поддерживает data-driven настройки дизайнерами. citeturn17view0turn16view5

### Матрица падения мотивации главного персонажа

Если ты хочешь, чтобы и главный персонаж, и NPC подчинялись одной доменной модели, то “мотивация” должна быть не абстрактным настроением, а **сводным ресурсом готовности продолжать линию поведения**. Здесь полезно опираться на потребности, усталость, страх и социальную поддержку. D&D basic rules хороши тем, что явно отличают exhaustion, hunger, water, rest и effect on capability; appraisal-подход полезен тем, что связывает внутренние эмоциональные процессы с изменением поведения. citeturn21view0turn15view8turn15view9turn17view2

Я бы делал `motivation` как производную от:

- сытость, жажда, отдых;
- боль и накопленный урон;
- недавние провалы;
- потери союзников;
- успехи и чувство контроля;
- соответствие действия личным ценностям/клятвам;
- ощущение социальной поддержки;
- страх и hopelessness.

Тогда не нужен отдельный “магический скриптовый флаг уныния”. Персонаж сам может переходить в режимы `press_on`, `hesitate`, `refuse`, `panic`, `seek_rest`, `seek_companion`, `retreat`. Для сюжетного героя это особенно ценно, потому что мотивация превращается в системную механику, а не в один сценарный if.

## Интерфейс TypeScript для бекенда

Ниже — **предлагаемый backend-first интерфейс**, который специально рассчитан на один доменный объект для игрока, сетевого игрока, NPC и скрипта. Он отражает server-authoritative модель, data-driven abilities/effects, композиционную архитектуру и отдельную социальную подсистему. Это уже не цитата из одного движка, а синтез лучших практик из ECS/component-подходов, GAS-подобных систем, server-authoritative multiplayer и utility-driven AI. citeturn15view2turn24view0turn18view0turn15view1turn16view5

```ts
/**
 * Универсальная доменная модель персонажа для backend-логики RPG.
 *
 * Ключевая идея:
 * - один и тот же интерфейс используется для player, remote player, NPC, summon, scripted actor;
 * - различается не "тип класса", а источник управляющих намерений;
 * - класс является aggregate root и координирует подсистемы, но не вшивает в себя
 *   реализацию мира, рендера, UI или сетевого транспорта.
 *
 * Важно:
 * - любые gameplay-critical решения должны подтверждаться сервером;
 * - pathfinding, line-of-sight, collision queries и world lookups идут через внешние сервисы;
 * - социальные отношения и репутация вынесены в отдельный агрегат/сервис.
 */
export interface CharacterAggregate {
    /**
     * Уникальный идентификатор персонажа в домене.
     */
    readonly id: CharacterId

    /**
     * Неподвижные или редко меняющиеся сведения.
     * Сюда входят архетип, фракции, происхождение и другие identity-level данные.
     */
    readonly identity: CharacterIdentity

    /**
     * Текущий источник управления.
     * Сам персонаж не зависит от того, кто им управляет; это лишь метаданные.
     */
    controller: CharacterControllerBinding

    /**
     * Пространственное и навигационное состояние.
     */
    locomotion: CharacterLocomotionState

    /**
     * Базовые и текущие атрибуты.
     * HP, mana, energy, movement speed, perception, hunger и т.д.
     */
    attributes: CharacterAttributeSet

    /**
     * Собранные вторичные боевые и небоевые производные.
     * Например: effectiveMoveSpeed, armorReduction, castSpeed, carryCapacity.
     */
    derived: CharacterDerivedStats

    /**
     * Сенсоры и ограничения восприятия.
     * Позволяет хранить vision radius, hearing, darkvision, tremorsense и особые режимы.
     */
    senses: CharacterSenseProfile

    /**
     * Физиология и потребности существа.
     * Нужна ли еда, вода, сон, отдых, воздух, действует ли усталость и т.п.
     */
    physiology: CharacterPhysiologyProfile

    /**
     * Текущее множество активных тэгов.
     * Пример: state.cc.stunned, state.form.ethereal, state.visibility.invisible.
     */
    tags: GameplayTagSet

    /**
     * Активные эффекты, влияющие на атрибуты, тэги, способности и правила поведения.
     */
    effects: ReadonlyMap<EffectInstanceId, ActiveEffectInstance>

    /**
     * Все выданные персонажу способности и их runtime-state.
     */
    abilityBook: CharacterAbilityBook

    /**
     * Система развития на основе использования.
     */
    progression: CharacterProgressionState

    /**
     * Предыстория персонажа.
     * Относительно статичный narrative-layer, не равный памяти о текущих событиях.
     */
    background: CharacterBackgroundProfile

    /**
     * Память персонажа о фактах, наблюдениях и событиях.
     * Подходит как для AI, так и для narrative-логики.
     */
    memory: CharacterMemoryState

    /**
     * Технический журнал последних действий.
     * Обычно хранится как ограниченный ring buffer для дебага, реплеев и AI-анализа.
     */
    recentActionLog: ReadonlyArray<CharacterActionLogEntry>

    /**
     * Ссылка на внешнюю социальную подсистему.
     * Сам граф отношений хранится отдельно.
     */
    socialRef?: SocialAgentRef

    /**
     * Версия состояния для optimistic concurrency / репликации / дедупликации апдейтов.
     */
    version: number

    /**
     * validate-only проверка намерения без мутации состояния.
     *
     * Использовать до применения команды, чтобы быстро понять:
     * - доступно ли действие;
     * - блокируют ли тэги применение;
     * - хватает ли ресурсов;
     * - разрешён ли тип управления;
     * - достижима ли цель в текущем world context.
     */
    canAcceptIntent(
        intent: CharacterIntent,
        ctx: CharacterReadContext
    ): ValidationResult

    /**
     * Главная точка входа доменных команд.
     *
     * Все контроллеры – человек, сеть, AI, скрипт – должны приходить сюда.
     * Возвращает доменные события, которые затем могут быть:
     * - сохранены,
     * - реплицированы,
     * - переданы в другие bounded contexts.
     */
    applyIntent(
        intent: CharacterIntent,
        ctx: CharacterCommandContext
    ): DomainEvent[]

    /**
     * Серверный апдейт персонажа на тик.
     *
     * Здесь происходят:
     * - регенерация и распад ресурсов;
     * - тики эффектов;
     * - продвижение по текущему пути;
     * - спад агро/эмоций/усталости;
     * - завершение кулдаунов;
     * - обслуживание ongoing-способностей.
     */
    tick(dtMs: number, ctx: CharacterCommandContext): DomainEvent[]

    /**
     * Явный запрос на прямое движение.
     *
     * Подходит для WASD / стика / AI steering.
     * direction должен быть нормализован или ограничен валидатором.
     */
    requestMove(
        direction: Vector2Like,
        source: CommandSource,
        meta?: CommandMeta
    ): DomainEvent[]

    /**
     * Явный запрос на движение к целевой точке.
     *
     * Важно:
     * - сам персонаж не обязан считать путь;
     * - он может сформировать navigation request через ctx.navigation;
     * - исполнение пути остаётся server-authoritative.
     */
    requestMoveTo(
        target: WorldPoint,
        options: MoveToOptions,
        source: CommandSource,
        meta?: CommandMeta
    ): DomainEvent[]

    /**
     * Запрос на использование способности.
     *
     * Spell, melee technique, shout, utility action – всё выражается одинаково.
     */
    requestAbilityUse(
        input: AbilityUseRequest,
        source: CommandSource,
        meta?: CommandMeta
    ): DomainEvent[]

    /**
     * Серверное применение игрового эффекта к персонажу.
     * Используется боем, аурой, зонами, предметами, триггерами карты и скриптами.
     */
    applyEffect(
        effect: EffectApplicationRequest,
        ctx: CharacterCommandContext
    ): DomainEvent[]

    /**
     * Прямое изменение HP и производных ресурсов через доменную механику урона.
     */
    receiveDamage(
        input: DamageRequest,
        ctx: CharacterCommandContext
    ): DomainEvent[]

    /**
     * Лечение, восстановление, щиты и другие позитивные изменения живучести.
     */
    receiveHealing(
        input: HealingRequest,
        ctx: CharacterCommandContext
    ): DomainEvent[]

    /**
     * Обновление памяти персонажа.
     * Можно использовать после наблюдения события, слуха, диалога или скриптового откровения.
     */
    remember(entry: MemoryEntry, meta?: CommandMeta): DomainEvent[]

    /**
     * Регистрация факта использования навыка/способности для progression by use.
     */
    registerUsage(signal: UsageSignal, meta?: CommandMeta): DomainEvent[]

    /**
     * Явный снимок состояния для репликации, кэша или save-game.
     */
    toSnapshot(): CharacterSnapshot
}

/**
 * Редко меняющиеся сведения о персонаже.
 */
export interface CharacterIdentity {
    id: CharacterId
    codeName: string
    displayName: string
    archetype: CharacterArchetype
    species: string
    factions: string[]
    tags: GameplayTagSet
    isPlayerCapable: boolean
    isNpcCapable: boolean
    isScriptControllable: boolean
    isNetworkReplicated: boolean
}

/**
 * Кто именно сейчас подаёт команды персонажу.
 *
 * Один и тот же персонаж может в разные моменты переключаться:
 * player -> autopilot -> cutscene script -> AI companion.
 */
export interface CharacterControllerBinding {
    mode: ControllerMode
    authority: AuthorityMode
    ownerConnectionId?: string
    ownerPlayerId?: string
    aiProfileId?: string
    scriptDriverId?: string
}

export type ControllerMode =
    'human_local' | 'human_remote' | 'ai' | 'script' | 'replay' | 'none'

export type AuthorityMode =
    | 'server_authoritative'
    | 'server_with_client_anticipation'
    | 'offline_singleplayer'

/**
 * Набор основных числовых атрибутов.
 *
 * Рекомендуется хранить base/current/max/min отдельно.
 * Это удобно для временных эффектов, постоянных апгрейдов и клампа.
 */
export interface CharacterAttributeSet {
    values: ReadonlyMap<AttributeKey, AttributeValue>
}

export interface AttributeValue {
    key: AttributeKey
    base: number
    current: number
    min: number
    max: number
    regenPerSecond?: number
    decayPerSecond?: number
    lastChangedAtMs: number
}

export type AttributeKey =
    | 'hp'
    | 'mana'
    | 'energy'
    | 'stamina'
    | 'moveSpeed'
    | 'attackSpeed'
    | 'castSpeed'
    | 'armor'
    | 'magicResist'
    | 'visionRadius'
    | 'hearingRadius'
    | 'stealth'
    | 'detection'
    | 'morale'
    | 'hunger'
    | 'thirst'
    | 'fatigue'
    | 'restDebt'

/**
 * Производные статы вычисляются из атрибутов, экипировки, способностей и эффектов.
 * Обычно их не редактируют вручную.
 */
export interface CharacterDerivedStats {
    effectiveMoveSpeed: number
    effectiveTurnRate?: number
    effectiveVisionRadius: number
    effectiveHearingRadius: number
    effectiveThreat: number
    carryCapacity?: number
    canTraverseWalls?: boolean
    ignoresDifficultTerrain?: boolean
}

/**
 * Текущая пространственная информация и состояние движения.
 */
export interface CharacterLocomotionState {
    position: WorldPoint
    velocity: Vector2Like
    facing: Vector2Like
    movementMode: MovementMode
    pathState?: PathExecutionState
    collisionProfile: CollisionProfileKey
    occupiedSpaceRadius: number
    lastNavFailure?: NavigationFailure
}

export type MovementMode =
    | 'idle'
    | 'walk'
    | 'run'
    | 'sprint'
    | 'crawl'
    | 'fly'
    | 'swim'
    | 'phasing'
    | 'knockback'
    | 'scripted'

/**
 * Состояние исполнения конкретного пути.
 */
export interface PathExecutionState {
    requestId: string
    target: WorldPoint
    currentWaypointIndex: number
    waypoints: WorldPoint[]
    repathPolicy: RepathPolicy
    startedAtMs: number
}

export type RepathPolicy = 'none' | 'on_blocked' | 'periodic' | 'aggressive'

/**
 * Профиль восприятия.
 */
export interface CharacterSenseProfile {
    sight: SenseChannel
    hearing: SenseChannel
    smell?: SenseChannel
    tremor?: SenseChannel
    magic?: SenseChannel
    specialTags: GameplayTagSet
}

export interface SenseChannel {
    enabled: boolean
    radius: number
    arcDegrees?: number
    blockedByTags?: GameplayTagSet
    ignoresTags?: GameplayTagSet
}

/**
 * Потребности и ограничения живого/неживого существа.
 */
export interface CharacterPhysiologyProfile {
    needsFood: boolean
    needsWater: boolean
    needsSleep: boolean
    needsRest: boolean
    needsBreath: boolean
    ages: boolean
    canBleed: boolean
    canBePoisoned: boolean
    canBeDiseased: boolean
    foodPerDay?: number
    waterPerDay?: number
    optimalRestHours?: number
    specialTags: GameplayTagSet
}

/**
 * Иерархические семантические тэги.
 */
export type GameplayTag = string
export type GameplayTagSet = ReadonlySet<GameplayTag>

/**
 * Активный эффект на персонаже.
 *
 * Не хранит полноценную gameplay-логику внутри персонажа;
 * использует data-driven definition и runtime-поля экземпляра.
 */
export interface ActiveEffectInstance {
    instanceId: EffectInstanceId
    definitionId: string
    source?: EffectSourceRef
    stacks: number
    startedAtMs: number
    expiresAtMs?: number
    grantedTags: GameplayTagSet
    suppressed: boolean
    modifiers: AttributeModifier[]
    metadata?: Record<string, unknown>
}

export type EffectInstanceId = string

export interface AttributeModifier {
    attribute: AttributeKey
    operation: ModifierOperation
    value: number
    order?: number
}

export type ModifierOperation =
    'add' | 'multiply' | 'override' | 'clamp_min' | 'clamp_max'

/**
 * Все runtime-данные способностей, выданных персонажу.
 */
export interface CharacterAbilityBook {
    abilities: ReadonlyMap<AbilityId, CharacterAbilityInstance>
    equippedLoadout?: string[]
    blockedTags: GameplayTagSet
}

export type AbilityId = string

export interface CharacterAbilityInstance {
    id: AbilityId
    definitionId: string
    level: number
    masteryProgress: number
    cooldownEndAtMs?: number
    charges?: number
    isUnlocked: boolean
    isPassive: boolean
    grantedBy?: 'class' | 'item' | 'effect' | 'progression' | 'script'
}

/**
 * Состояние системы развития через фактическое использование.
 */
export interface CharacterProgressionState {
    tracks: ReadonlyMap<ProgressionTrackKey, ProgressionTrackState>
    unlockedNodes: ReadonlySet<ProgressionNodeId>
    pendingUnlocks: ProgressionNodeId[]
}

export type ProgressionTrackKey =
    | 'weapon.sword'
    | 'weapon.axe'
    | 'combat.block'
    | 'combat.dodge'
    | 'magic.fire'
    | 'magic.ice'
    | 'magic.arcane'
    | 'survival.endurance'
    | 'survival.scouting'
    | 'social.intimidation'
    | 'social.diplomacy'
    | 'craft.alchemy'

export type ProgressionNodeId = string

export interface ProgressionTrackState {
    key: ProgressionTrackKey
    level: number
    xp: number
    totalXp: number
    lastUsageAtMs?: number
}

/**
 * Статическая или полустатическая narrative-информация.
 */
export interface CharacterBackgroundProfile {
    origin?: string
    vocation?: string
    upbringing?: string
    vows?: string[]
    traumas?: string[]
    faith?: string
    factionHistory?: string[]
    authoredFacts: ReadonlyArray<BackgroundFact>
}

export interface BackgroundFact {
    id: string
    tags: GameplayTagSet
    text: string
    importance: number
}

/**
 * Память персонажа о мире.
 */
export interface CharacterMemoryState {
    working: ReadonlyArray<MemoryEntry>
    episodic: ReadonlyArray<MemoryEntry>
    facts: ReadonlyMap<string, MemoryFact>
    capacity: MemoryCapacityPolicy
}

export interface MemoryEntry {
    id: string
    type: 'observation' | 'dialogue' | 'combat' | 'rumor' | 'quest' | 'social'
    atMs: number
    location?: WorldPoint
    subjectIds?: CharacterId[]
    tags: GameplayTagSet
    salience: number
    confidence: number
    payload?: Record<string, unknown>
}

export interface MemoryFact {
    key: string
    value: unknown
    confidence: number
    source: 'observed' | 'heard' | 'inferred' | 'scripted'
    lastUpdatedAtMs: number
}

export interface MemoryCapacityPolicy {
    workingLimit: number
    episodicLimit: number
    forgettingHalfLifeMs?: number
}

/**
 * Последние действия – компактный технический журнал.
 */
export interface CharacterActionLogEntry {
    atMs: number
    type: string
    source: CommandSource
    summary: string
    tags?: GameplayTagSet
    relatedEntityIds?: CharacterId[]
}

/**
 * Ссылка на внешний social/reputation-слой.
 */
export interface SocialAgentRef {
    socialAgentId: string
}

/**
 * Отдельная подсистема отношений и репутации.
 *
 * Почему отдельно:
 * - отношения являются ребрами графа, а не локальным полем Character;
 * - репутация к игроку зависит от конкретного NPC;
 * - доверие, слухи и распространение знаний должны обслуживаться отдельно.
 */
export interface CharacterSocialGraph {
    getRelation(a: SocialAgentRef, b: SocialAgentRef): SocialRelationEdge | null
    upsertRelation(edge: SocialRelationEdge): void
    observeEvent(input: SocialObservationEvent): DomainEvent[]
    propagateInformation(input: ReputationPropagationInput): DomainEvent[]
    getReputation(
        observer: SocialAgentRef,
        target: CharacterId
    ): ReputationView | null
}

export interface SocialRelationEdge {
    from: string
    to: string
    liking: number
    trust: number
    fear: number
    respect: number
    dominance: number
    solidarity: number
    familiarity: number
    factionAffinity?: number
    lastChangedAtMs: number
}

export interface ReputationView {
    observerId: string
    targetId: CharacterId
    score: number
    confidence: number
    tags: GameplayTagSet
    lastUpdatedAtMs: number
}

/**
 * Унифицированные доменные намерения.
 * Любой источник управления должен сводиться к одному из этих payload-видов.
 */
export type CharacterIntent =
    | MoveIntent
    | MoveToIntent
    | UseAbilityIntent
    | InteractIntent
    | CancelIntent
    | RestIntent
    | ConsumeIntent
    | ScriptedOverrideIntent

export interface BaseIntent {
    id: string
    source: CommandSource
    issuedAtMs: number
}

export interface MoveIntent extends BaseIntent {
    kind: 'move'
    direction: Vector2Like
    magnitude?: number
}

export interface MoveToIntent extends BaseIntent {
    kind: 'move_to'
    target: WorldPoint
    options?: MoveToOptions
}

export interface UseAbilityIntent extends BaseIntent {
    kind: 'use_ability'
    request: AbilityUseRequest
}

export interface InteractIntent extends BaseIntent {
    kind: 'interact'
    interaction: string
    targetEntityId?: string
    targetPoint?: WorldPoint
}

export interface CancelIntent extends BaseIntent {
    kind: 'cancel'
    cancelScope: 'movement' | 'ability' | 'channel' | 'all'
}

export interface RestIntent extends BaseIntent {
    kind: 'rest'
    restType: 'short' | 'long' | 'field' | 'camp'
}

export interface ConsumeIntent extends BaseIntent {
    kind: 'consume'
    consumeType: 'food' | 'water' | 'potion' | 'item'
    itemId: string
}

export interface ScriptedOverrideIntent extends BaseIntent {
    kind: 'scripted_override'
    forceStateTag?: GameplayTag
    forcePoint?: WorldPoint
    payload?: Record<string, unknown>
}

export interface AbilityUseRequest {
    abilityId: AbilityId
    targetEntityId?: string
    targetPoint?: WorldPoint
    targetingMode: 'self' | 'entity' | 'point' | 'direction' | 'none'
    direction?: Vector2Like
    queued?: boolean
}

export interface DamageRequest {
    amount: number
    school: string
    source?: EffectSourceRef
    tags?: GameplayTagSet
    canCrit?: boolean
    canBeMitigated?: boolean
}

export interface HealingRequest {
    amount: number
    source?: EffectSourceRef
    tags?: GameplayTagSet
}

export interface EffectApplicationRequest {
    definitionId: string
    source?: EffectSourceRef
    stacks?: number
    durationMs?: number
    metadata?: Record<string, unknown>
}

export interface UsageSignal {
    track: ProgressionTrackKey
    atMs: number
    actionTag: GameplayTag
    targetDifficulty?: number
    novelty?: number
    successQuality?: number
    repetitionPenalty?: number
    payload?: Record<string, unknown>
}

/**
 * Вспомогательные world/service контексты.
 */
export interface CharacterReadContext {
    nowMs: number
    world: CharacterWorldReadService
}

export interface CharacterCommandContext extends CharacterReadContext {
    navigation: CharacterNavigationService
    rules: CharacterRulesService
    randomness?: RandomService
}

export interface CharacterWorldReadService {
    canOccupy(point: WorldPoint, profile: CollisionProfileKey): boolean
    canSee(from: CharacterId, to: CharacterId): boolean
    distance(a: WorldPoint, b: WorldPoint): number
}

export interface CharacterNavigationService {
    buildPath(
        actorId: CharacterId,
        from: WorldPoint,
        to: WorldPoint,
        options?: MoveToOptions
    ): NavigationPathResult
}

export interface CharacterRulesService {
    evaluateTagBlockers(
        tags: GameplayTagSet,
        required?: GameplayTagSet,
        blocked?: GameplayTagSet
    ): boolean
    clampAttribute(attribute: AttributeKey, value: number): number
}

/**
 * Базовые типы.
 */
export type CharacterId = string
export type CollisionProfileKey = string

export interface WorldPoint {
    x: number
    y: number
    z?: number
}

export interface Vector2Like {
    x: number
    y: number
}

export interface CommandSource {
    type: ControllerMode
    actorId?: string
    connectionId?: string
    scriptId?: string
}

export interface CommandMeta {
    correlationId?: string
    traceId?: string
    debugLabel?: string
}

export interface MoveToOptions {
    acceptanceRadius?: number
    repathPolicy?: RepathPolicy
    allowPartialPath?: boolean
    ignoreDynamicObstacles?: boolean
}

export interface NavigationPathResult {
    ok: boolean
    waypoints: WorldPoint[]
    failure?: NavigationFailure
}

export interface NavigationFailure {
    code:
        | 'unreachable'
        | 'blocked'
        | 'invalid_target'
        | 'no_nav_data'
        | 'forbidden'
    detail?: string
}

export interface ValidationResult {
    ok: boolean
    reasons: ReadonlyArray<string>
}

export interface CharacterSnapshot {
    id: CharacterId
    version: number
    position: WorldPoint
    velocity: Vector2Like
    tags: string[]
    attributes: Record<string, number>
    effects: ReadonlyArray<{
        instanceId: string
        definitionId: string
        stacks: number
        expiresAtMs?: number
    }>
    abilities: ReadonlyArray<{
        id: string
        level: number
        cooldownEndAtMs?: number
        isUnlocked: boolean
    }>
}

export interface EffectSourceRef {
    actorId?: CharacterId
    abilityId?: AbilityId
    itemId?: string
    worldObjectId?: string
}

export interface DomainEvent {
    type: string
    atMs: number
    actorId: CharacterId
    payload?: Record<string, unknown>
}

export type CharacterArchetype =
    | 'player'
    | 'companion'
    | 'villager'
    | 'guard'
    | 'monster'
    | 'boss'
    | 'summon'
    | 'scripted_actor'

export interface RandomService {
    nextFloat(): number
}
```

В таком виде у тебя получается не “суперкласс, который знает всё на свете”, а **единый доменный фасад**, который одинаково пригоден для человека, сетевого игрока, NPC и скрипта. Его сильная сторона в том, что он остаётся универсальным, но при этом не становится `God object`, потому что социальный граф, навигация, world queries и rules движка живут отдельно. Это лучше согласуется и с компонентной архитектурой, и с server-authoritative мультиплеером, и с data-driven RPG-системами. citeturn15view2turn24view0turn15view1turn18view0

Если свести всё к одной проектной формуле, то она будет такой: **один персонаж, один доменный API, одна серверная правда, много источников намерений, много модульных подсистем**. Именно этот подход даст тебе и одинаковое сетевое поведение NPC/игроков, и расширяемые эффекты/способности, и реалистичную репутацию, и manageable AI без архитектурного долга через полгода разработки. citeturn15view1turn17view0turn16view5turn25view0
