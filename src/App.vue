<script lang="ts" setup>
import type { Action } from 'element-plus'
import { ElAvatar, ElConfigProvider, ElMessage, ElMessageBox } from 'element-plus'
import { computed, h, onMounted, ref, unref } from 'vue'

import SafeHtml from '@/components/SafeHtml.vue'
import userVue from '@/components/conf/User.vue'
import { counter } from '@/message'
import { useUser } from '@/stores/user'
import { logger } from '@/utils/logger'

const user = useUser()

const confBox = ref(false)

const confs = {
  user: { name: '账号配置', component: userVue, disabled: false },
}

const confKey = ref<keyof typeof confs>('user')
const dark = ref(false)
const launcherExpanded = ref(false)
const protocolStorageKey = 'boss-protocol'
const protocolVersion = '2025/06/14'
const userInfo = computed(() => unref(user.info))
const storedAccounts = computed(() => unref(user.cookieTableData) ?? [])

const currentUserLabel = computed(() => userInfo.value?.showName ?? userInfo.value?.name ?? '当前页面未识别账号')
const currentUserAvatar = computed(
  () => userInfo.value?.tinyAvatar ?? userInfo.value?.largeAvatar ?? 'https://avatars.githubusercontent.com/u/68412205?v=4',
)
const quickStats = computed(() => [
  {
    label: '已保存账号',
    value: String(storedAccounts.value.length),
    caption: '本地账户档案',
  },
  {
    label: '主题模式',
    value: dark.value ? 'Dark' : 'Light',
    caption: dark.value ? '夜间界面已开启' : '清晰亮色界面',
  },
  {
    label: '帮助入口',
    value: 'README',
    caption: '协议说明与文档入口',
  },
])

counter.storageGet('theme-dark', false).then((res) => {
  dark.value = res
  document.documentElement.classList.toggle('dark', dark.value)
})

async function themeChange() {
  dark.value = !dark.value
  if (dark.value) {
    ElMessage({
      message: '已切换到暗黑模式，如有样式没适配且严重影响使用，请反馈',
      duration: 5000,
      showClose: true,
    })
  }
  document.documentElement.classList.toggle('dark', dark.value)
  await counter.storageSet('theme-dark', dark.value)
}

function toggleLauncher() {
  launcherExpanded.value = !launcherExpanded.value
}

function openUserCenter() {
  launcherExpanded.value = true
  confKey.value = 'user'
  confBox.value = true
}

// logger.log(monkeyWindow, window, unsafeWindow);

const protocolNotice = `1. 使用前先好好了解项目，阅读 README、docs 以及界面里的帮助说明
2. 如果帮助文案仍无法解决问题，优先通过当前仓库的 GitHub Issues 反馈
3. 当前仓库的说明、安装方式和发布信息以本仓库 README 与 docs 为准，不沿用历史问卷或旧仓库链接
4. 帮助复选框 能随时进入和退出帮助模式, 配置内容较多, 好好观看
5. 配置最前面需要打钩启用，启用后需要保存配置
6. 配置项 包含/排除 能点击切换模式
7. 投递在达到上限，或者页面无法滚动时会结束投递，反馈相关问题检查是否滚动到底了，无法刷出新岗位!
8. 使用插件时尽量少打开devtools，否则容易导致获取不到Boss的职位列表

本项目仅供学习交流，禁止用于商业用途
使用该脚本有一定风险(如黑号,封号,权重降低等)，本项目不承担任何责任
当前仓库: <a href="https://github.com/nikkkoni/boss-helper" target="_blank" rel="noreferrer">https://github.com/nikkkoni/boss-helper</a>
问题反馈: <a href="https://github.com/nikkkoni/boss-helper/issues" target="_blank" rel="noreferrer">https://github.com/nikkkoni/boss-helper/issues</a>
文档入口: <a href="https://github.com/nikkkoni/boss-helper#readme" target="_blank" rel="noreferrer">README 与 docs</a>`

function openProtocolNotice() {
  ElMessageBox({
    title: '注意事项',
    autofocus: true,
    confirmButtonText: '了解并同意!',
    message: () => h(SafeHtml, { class: 'protocol-notice', tag: 'div', html: protocolNotice }),
    customStyle:
      '--el-messagebox-width: unset; white-space: pre-wrap; width: unset;max-width: unset;' as never,
    callback: (action: Action) => {
      if (action === 'confirm') {
        counter.storageSet(protocolStorageKey, protocolVersion)
      }
    },
  })
}

async function ensureProtocolNotice() {
  const protocolDate = await counter.storageGet<string>(protocolStorageKey)
  if (protocolDate !== protocolVersion) {
    openProtocolNotice()
  }
}

onMounted(async () => {
  logger.info('BossHelper挂载成功')
  ElMessage('BossHelper挂载成功!')

  void user.initUser()
  void user.initCookie()
  await ensureProtocolNotice()
})
</script>

<template>
  <ElConfigProvider namespace="ehp">
    <div class="boss-helper-launcher" :class="launcherExpanded ? 'is-expanded' : 'is-collapsed'">
      <div class="boss-helper-launcher__panel">
        <button
          v-if="!launcherExpanded"
          type="button"
          class="boss-helper-launcher__fab"
          aria-label="展开 Boss Helper 控制台"
          @click="toggleLauncher"
        >
          <ElAvatar :size="42" :src="currentUserAvatar">
            {{ currentUserLabel.slice(0, 1) }}
          </ElAvatar>
        </button>

        <template v-else>
          <div class="boss-helper-launcher__halo boss-helper-launcher__halo--primary" />
          <div class="boss-helper-launcher__halo boss-helper-launcher__halo--secondary" />

          <div class="boss-helper-launcher__top">
            <div class="boss-helper-launcher__title-block">
              <div class="boss-helper-launcher__brand">
                <span class="boss-helper-launcher__eyebrow">Boss Helper</span>
                <strong>Automation Console</strong>
              </div>
              <span class="boss-helper-launcher__user-line">{{ currentUserLabel }}</span>
            </div>

            <div class="boss-helper-launcher__top-actions">
              <button type="button" class="boss-helper-launcher__toggle" @click="toggleLauncher">
                收起
              </button>

              <button type="button" class="boss-helper-launcher__theme" @click="themeChange">
                <span class="boss-helper-launcher__theme-track">
                  <span class="boss-helper-launcher__theme-thumb" />
                </span>
                <span>{{ dark ? '夜间' : '明亮' }}</span>
              </button>
            </div>
          </div>

          <div class="boss-helper-launcher__profile">
            <ElAvatar :size="52" :src="currentUserAvatar">
              {{ currentUserLabel.slice(0, 1) }}
            </ElAvatar>
            <div class="boss-helper-launcher__profile-copy">
              <strong>{{ currentUserLabel }}</strong>
              <p>浏览器扩展控制台</p>
            </div>
          </div>

          <div class="boss-helper-launcher__stats">
            <article v-for="item in quickStats" :key="item.label" class="boss-helper-launcher__stat">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
              <small>{{ item.caption }}</small>
            </article>
          </div>

          <div class="boss-helper-launcher__actions">
            <button
              type="button"
              class="boss-helper-launcher__action boss-helper-launcher__action--primary"
              @click="openUserCenter"
            >
              账户配置
            </button>
            <button type="button" class="boss-helper-launcher__action" @click="openProtocolNotice">
              帮助说明
            </button>
          </div>
        </template>
      </div>
    </div>

    <Teleport to="body">
      <component :is="confs[confKey].component" id="help-conf-box" v-model="confBox" />
    </Teleport>
  </ElConfigProvider>
</template>

<style lang="scss">
.protocol-notice {
  white-space: pre-wrap;
}
</style>
