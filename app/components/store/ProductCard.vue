<script setup lang="ts">
import type { ProductCard } from '~/composables/useStore'

const props = defineProps<{ product: ProductCard, eager?: boolean }>()
const { money } = useFormat()
const price = computed(() => (props.product.priceFrom === props.product.priceTo ? money(props.product.priceFrom) : `From ${money(props.product.priceFrom)}`))
</script>

<template>
  <NuxtLink :to="`/products/${product.slug}`" class="group block rounded-3xl bg-sand-100 p-5 transition duration-500 hover:shadow-[0_20px_50px_-25px_rgba(0,0,0,0.25)]">
    <p class="h-4 text-[12px] font-semibold" :class="!product.inStock ? 'text-ink-muted' : 'text-accent-dark'">
      {{ !product.inStock ? 'Sold out' : product.isNew ? 'New' : product.lowStock ? 'Only a few left' : '' }}
    </p>
    <div class="relative mt-3 overflow-hidden rounded-2xl">
      <UiProductImage :image-key="product.images[0]?.key" :alt="product.images[0]?.alt || product.name" aspect="aspect-square" rounded="rounded-2xl" :eager="eager" class="transition-transform duration-700 ease-out group-hover:scale-[1.04]" />
      <img
        v-if="product.images[1]"
        :src="`/media/${product.images[1].key}`"
        :alt="product.images[1].alt || product.name"
        loading="lazy"
        class="absolute inset-0 size-full object-cover opacity-0 transition duration-700 group-hover:scale-[1.04] group-hover:opacity-100"
      >
    </div>
    <h3 class="mt-5 line-clamp-2 text-[17px] font-semibold leading-snug tracking-[-0.01em] text-ink">{{ product.name }}</h3>
    <p class="mt-1 text-[13px] text-ink-muted">{{ product.category.name }}</p>
    <p class="num mt-3 text-[15px] text-ink">{{ price }}</p>
  </NuxtLink>
</template>
