import { fileURLToPath } from 'node:url'

import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { defineConfig } from 'vitest/config'

const phase2CoverageInclude = [
  'src/composables/useApplying/*.ts',
  'src/composables/usePipelineCache.ts',
  'src/composables/useModel/*.ts',
  'src/composables/useWebSocket/*.ts',
  'src/entrypoints/background.ts',
  'src/message/agent.ts',
  'src/message/contentScript.ts',
  'src/pages/zhipin/hooks/useDeliveryControl.ts',
  'src/stores/conf/validation.ts',
  'src/utils/amap.ts',
  'src/utils/deepmerge.ts',
  'src/utils/elmGetter.ts',
  'src/utils/parse.ts',
  'src/utils/request.ts',
]

export default defineConfig({
  plugins: [vue(), vueJsx()],
  resolve: {
    alias: [
      {
        find: /^#imports$/,
        replacement: fileURLToPath(new URL('./tests/mocks/wxt-imports.ts', import.meta.url)),
      },
      {
        find: /^@\/message$/,
        replacement: fileURLToPath(new URL('./tests/mocks/message.ts', import.meta.url)),
      },
      {
        find: /^@\/utils\/logger$/,
        replacement: fileURLToPath(new URL('./tests/mocks/logger.ts', import.meta.url)),
      },
      {
        find: /^@\//,
        replacement: `${fileURLToPath(new URL('./src', import.meta.url))}/`,
      },
    ],
  },
  test: {
    coverage: {
      exclude: [
        'src/**/*.d.ts',
        'src/env.d.ts',
        'src/assets/**',
        'src/types/**',
      ],
      include: phase2CoverageInclude,
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      thresholds: {
        branches: 75,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup/vitest.setup.ts'],
  },
})
