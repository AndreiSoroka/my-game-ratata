export const adventureNoticeLines = {
    'world.well': ['Колодец', 'Well'],
    'world.water': ['Чистая вода', 'Fresh water'],
    'world.trough': ['Поилка с водой', 'Water trough'],
    'world.pond': ['Вода у берега', 'Water at the shore'],
    'world.bell': ['Колокол памяти', 'Bell of Memory'],
    'world.outOfReach': [
        'Подойди ближе к предмету: через стену взаимодействовать нельзя.',
        'Move closer. You cannot interact through a wall.',
    ],
    'world.bellUnavailable': [
        'Этот колокол сейчас недоступен.',
        'This bell is currently unavailable.',
    ],
    'world.bellAlreadyActive': [
        'Колокол памяти уже звучит.',
        'The Bell of Memory is already ringing.',
    ],
    'world.bellSilent': [
        'Колокол пока молчит. Сначала нужно выполнить общий городской заказ Миры.',
        'The bell is still silent. Complete Mira’s city job first.',
    ],
    'world.bellActivated': [
        'Колокол уже активирован.',
        'The bell has already been activated.',
    ],
    'world.bellRang': [
        'Колокол памяти зазвучал. Городские мастерские и торговля вновь открыты.',
        'The Bell of Memory is ringing. The city’s workshops and trade have reopened.',
    ],
    'world.drinkWait': [
        'Ты только что попил. Подожди немного.',
        'You just drank. Wait a moment.',
    ],
    'world.drinkRestore': [
        'Прохладная вода освежает. Силы восстановлены.',
        'The cool water refreshes you. Your energy is restored.',
    ],
    'world.drinkFull': [
        'Ты утолил жажду. Силы уже восстановлены.',
        'You quenched your thirst. Your energy was already full.',
    ],
    'world.drinkObserved': ['Пьёт воду.', 'Drinks water.'],
    'notice.conversationUnavailable': [
        'Подойди к живому собеседнику.',
        'Approach a living person to speak with them.',
    ],
    'notice.conversationReach': [
        'Подойди к живому собеседнику (радиус: {reach} кл.).',
        'Approach a living person within {reach} tiles to speak with them.',
    ],
    'notice.conversationInterrupted': [
        'Разговор прерван. Вернись к собеседнику.',
        'The conversation was interrupted. Return to your conversation partner.',
    ],
    'notice.dialogueChoiceUnavailable': [
        'Этот ответ сейчас недоступен.',
        'This response is currently unavailable.',
    ],
    'notice.serviceUnavailable': [
        'Эта услуга у собеседника недоступна.',
        'This person does not offer that service.',
    ],
    'notice.outOfStock': ['Товар закончился.', 'This item is out of stock.'],
    'notice.noMaterials': [
        'Не хватает материалов. Собери ресурсы в мире.',
        'You need more materials. Gather resources in the world.',
    ],
    'notice.noCraftingSpace': [
        'В рюкзаке нет места для созданного предмета.',
        'There is no room in your bag for the crafted item.',
    ],
    'notice.cannotCraft': [
        'Сейчас этот предмет создать нельзя.',
        'You cannot craft this item right now.',
    ],
    'notice.waitToGather': [
        'Подожди немного перед следующим сбором.',
        'Wait a moment before gathering again.',
    ],
    'notice.waitToWork': [
        'Подожди немного перед следующей работой.',
        'Wait a moment before working again.',
    ],
    'notice.plotAlreadySown': [
        'Эта грядка уже засеяна. Дождись урожая и собери его.',
        'This plot is already sown. Wait for the crop to ripen and harvest it.',
    ],
    'notice.farmEnergy': [
        'Для посева нужно {energy} сил. Передохни.',
        'Sowing requires {energy} energy. Rest first.',
    ],
    'notice.guildPayment': [
        'Гильдия выплатила {amount} золотых.',
        'The guild paid {amount} gold.',
    ],
    'trade.bellSilent': [
        'Городская торговля и услуги мастеров откроются, когда зазвучит Колокол памяти.',
        'City trade and workshop services reopen when the Bell of Memory rings.',
    ],
    'trade.blacklisted': [
        'Ты в городской книге нарушителей. Торговцы Новогорода отказывают тебе. Сестра Вера снимет запись за 30 золотых.',
        'You are in Novogorod’s offense register. Merchants refuse to trade with you. Sister Vera can remove the entry for 30 gold.',
    ],
    'trade.buy': [
        'Куплено: {item} × {quantity} · {total} золотых.',
        'Bought {quantity} for {total} gold.',
    ],
    'trade.sell': [
        'Продано: {item} × {quantity} · {total} золотых.',
        'Sold {quantity} for {total} gold.',
    ],
    'trade.repaired': [
        'Снаряжение отремонтировано за {total} золотых.',
        'Gear repaired for {total} gold.',
    ],
    'farm.nearby': [
        'Для работы нужна грядка поблизости в твоей локации.',
        'You need a nearby plot in your location.',
    ],
    'farm.seedRequired': [
        'Для посева нужно 1 семя пшеницы в рюкзаке. Поищи в сундуках, купи у торговца или собери урожай.',
        'You need one wheat seed in your bag. Look in chests, buy one from a merchant, or harvest wheat.',
    ],
    'farm.sown': [
        'Пшеница посеяна. Потрачено 1 семя и {energy} сил; урожай созреет через 45 секунд.',
        'Wheat sown. One seed and {energy} energy spent. The crop ripens in 45 seconds.',
    ],
    'farm.sowFirst': [
        'Сначала засевай пустую грядку.',
        'Sow the empty plot first.',
    ],
    'farm.notRipe': ['Пшеница ещё не созрела.', 'The wheat is still growing.'],
    'farm.noSpace': [
        'В рюкзаке нет места для всего урожая. Пшеница остаётся на грядке.',
        'There is not enough room in your bag. The wheat remains on the plot.',
    ],
    'farm.harvest': [
        'Собрано зерно +3. Семян не нашлось. Из зерна можно испечь хлеб.',
        'Harvested 3 grain. No seeds were found. You can bake bread with the grain.',
    ],
    'farm.harvestWithSeeds': [
        'Собрано зерно +3 и семена пшеницы +{seeds}. Семена пригодятся для нового посева.',
        'Harvested 3 grain and {seeds} wheat seeds for the next crop.',
    ],
    'resource.nearby': [
        'Для сбора нужен ресурс поблизости в твоей локации.',
        'You need a nearby resource in your location.',
    ],
    'resource.depleted': [
        'Этот ресурс исчерпан. Ищи другой источник в соседних землях.',
        'This resource is depleted. Check nearby lands for another source.',
    ],
    'resource.noSpace': [
        'В рюкзаке нет места для ресурса. Освободи ячейку.',
        'Your bag is full. Free an inventory slot to gather this resource.',
    ],
    'resource.gathered': [
        'Собрано: {material} +1.',
        'Gathered one unit of material.',
    ],
    'resource.crafted': ['Готово: {recipe}.', 'Crafting complete.'],
} as const
