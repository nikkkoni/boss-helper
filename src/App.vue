<script lang="ts" setup>
import type { Action } from 'element-plus'
import {
  ElAvatar,
  ElConfigProvider,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElMessage,
  ElMessageBox,
} from 'element-plus'
import { h, onMounted, ref } from 'vue'

import SafeHtml from '@/components/SafeHtml.vue'
import userVue from '@/components/conf/User.vue'
import { counter } from '@/message'
import { logger } from '@/utils/logger'

const confBox = ref(false)

const confs = {
  user: { name: '账号配置', component: userVue, disabled: false },
}

const confKey = ref<keyof typeof confs>('user')
const dark = ref(false)

counter.storageGet('theme-dark', false).then((res) => {
  dark.value = res
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

onMounted(async () => {
  logger.info('BossHelper挂载成功')
  ElMessage('BossHelper挂载成功!')

  const protocol = 'boss-protocol'
  const protocol_val = '2025/06/14'
  const protocol_date = await counter.storageGet<string>(protocol)
  if (protocol_date !== protocol_val) {
    ElMessageBox({
      title: '注意事项',
      autofocus: true,
      confirmButtonText: '了解并同意!',
      message: () => h(SafeHtml, { class: 'protocol-notice', tag: 'div', html: protocolNotice }),
      customStyle:
        '--el-messagebox-width: unset; white-space: pre-wrap; width: unset;max-width: unset;' as never,
      callback: (action: Action) => {
        if (action === 'confirm') {
          counter.storageSet(protocol, protocol_val)
        }
      },
    })
  }
})
</script>

<template>
  <ElConfigProvider namespace="ehp">
    <ElDropdown trigger="click">
      <ElAvatar :size="30" src="https://avatars.githubusercontent.com/u/68412205?v=4"> H </ElAvatar>
      <template #dropdown>
        <ElDropdownMenu>
          <ElDropdownItem disabled> BossHelp配置项 </ElDropdownItem>
          <ElDropdownItem divided disabled />
          <ElDropdownItem
            v-for="(v, k) in confs"
            :key="k"
            :disabled="v.disabled"
            @click="
              () => {
                confKey = k
                confBox = true
              }
            "
          >
            {{ v.name }}
          </ElDropdownItem>
          <ElDropdownItem disabled @click="themeChange">
            暗黑模式（{{ dark ? '开' : '关' }}）
          </ElDropdownItem>
        </ElDropdownMenu>
      </template>
    </ElDropdown>
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
