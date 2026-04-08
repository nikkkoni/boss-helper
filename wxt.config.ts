import vueJsx from '@vitejs/plugin-vue-jsx'
import { defineConfig } from 'wxt'

import { version } from './package.json'
// @ts-ignore Local build helper lives in a .mjs script.
import { getAgentBridgeTokenSync } from './scripts/agent-security.mjs'

const matches = ['*://zhipin.com/*', '*://*.zhipin.com/*']
const hostPermissions = ['*://zhipin.com/*', '*://*.zhipin.com/*']
const agentBridgeToken = getAgentBridgeTokenSync()

export default defineConfig({
  srcDir: 'src',
  outDirTemplate: '{{browser}}-mv{{manifestVersion}}',
  modules: ['@wxt-dev/module-vue'],
  imports: false,

  manifest: {
    default_locale: 'zh_CN',
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    permissions: ['storage', 'cookies', 'notifications'],
    externally_connectable: {
      matches: [
        'https://localhost/*',
        'https://127.0.0.1/*',
      ],
    },
    content_security_policy: {
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src 'self' https:;",
    },
    web_accessible_resources: [
      {
        resources: ['main-world.js'],
        matches,
      },
    ],
    host_permissions: hostPermissions,
  },
  vite: () => ({
    define: {
      __APP_VERSION__: JSON.stringify(version),
      __BOSS_HELPER_AGENT_BRIDGE_TOKEN__: JSON.stringify(agentBridgeToken),
    },
    ssr: {
      noExternal: ['@webext-core/storage', '@webext-core/messaging', '@webext-core/proxy-service'],
    },
    plugins: [vueJsx()],
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler', // or 'modern'
          additionalData: `@forward 'element-plus/theme-chalk/src/mixins/config.scss' with (
  $namespace: 'ehp'
);`,
        },
      },
    },
  }),
  hooks: {
    'build:manifestGenerated': (_wxt, manifest) => {
      manifest.content_scripts ??= []
      manifest.content_scripts.push({
        // Build extension once to see where your CSS get's written to
        css: ['/assets/main-world.css'],
        matches,
      })
    },
  },
})
