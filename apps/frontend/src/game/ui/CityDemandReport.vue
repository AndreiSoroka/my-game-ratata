<script setup lang="ts">
import type { MarketSnapshot } from '@my-game-ratata/contracts'
defineProps<{ market: MarketSnapshot }>()
</script>
<template>
    <section class="city-demand" aria-label="Спрос города">
        <h3>{{ market.cityName }} · потребности города</h3>
        <div class="city-demand__scroll">
            <table>
                <thead>
                    <tr>
                        <th>Товар</th>
                        <th>Запас / норма / резерв</th>
                        <th>Расход за 10 мин</th>
                        <th>Город покупает / продаёт</th>
                        <th>Доставлено / потрачено за 10 мин</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="row in market.rows" :key="row.itemId">
                        <th>
                            {{ row.label
                            }}<small>{{
                                row.stock === 0
                                    ? 'Нет в наличии'
                                    : row.stock < row.target / 2
                                      ? 'Дефицит'
                                      : row.stock >= row.capacity
                                        ? 'Закупка закрыта'
                                        : row.stock >= row.target
                                          ? 'Есть запас'
                                          : 'Есть спрос'
                            }}</small>
                        </th>
                        <td>{{ row.stock }} / {{ row.target }} / {{ row.capacity }}</td>
                        <td>{{ row.consumptionPer10Minutes }}</td>
                        <td>{{ row.sellPrice ?? '—' }} / {{ row.buyPrice ?? '—' }} ◈</td>
                        <td>{{ row.deliveredLast10Minutes }} / {{ row.consumedLast10Minutes }}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </section>
</template>
<style scoped>
.city-demand__scroll {
    max-height: 55vh;
    overflow: auto;
}
table {
    border-collapse: collapse;
    font: 12px system-ui;
    width: 100%;
}
th,
td {
    padding: 7px;
    text-align: left;
    border-bottom: 1px solid #566273;
}
small {
    display: block;
    font-size: 10px;
    color: #e8cc8c;
}
</style>
