<script setup lang="ts">
import { ORDER_STATUS, PAYMENT_RECORD_STATUS, PAYMENT_STATUS, PO_STATUS, type Tone } from '#shared/labels'

const props = defineProps<{ kind: 'order' | 'payment' | 'record' | 'po', value: string, dot?: boolean }>()
const map: Record<string, Record<string, { label: string, tone: Tone }>> = { order: ORDER_STATUS, payment: PAYMENT_STATUS, record: PAYMENT_RECORD_STATUS, po: PO_STATUS }
const info = computed(() => map[props.kind]?.[props.value] ?? { label: props.value, tone: 'neutral' as Tone })
</script>

<template>
  <UiBadge :tone="info.tone" :dot="dot">{{ info.label }}</UiBadge>
</template>
