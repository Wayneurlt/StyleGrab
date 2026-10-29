import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  rules: {
    'vue/multi-word-component-names': 'off',
    'vue/no-v-html': 'off',
    // Optional props are typed as `T | undefined`; forcing defaults adds noise.
    'vue/require-default-prop': 'off',
    '@typescript-eslint/no-explicit-any': 'error',
  },
})
