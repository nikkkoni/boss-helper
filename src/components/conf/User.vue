<script lang="ts" setup>
import {
  ElAlert,
  ElAvatar,
  ElButton,
  ElDialog,
  ElMessage,
  ElMessageBox,
  ElPopconfirm,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus'
import { computed, ref, unref } from 'vue'

import type { CookieInfo } from '@/message'
import { useUser } from '@/stores/user'
import { logger } from '@/utils/logger'

const user = useUser()

const show = defineModel<boolean>({ required: true })

const currentRow = ref<CookieInfo | undefined>()
const loading = ref(false)
const userInfo = computed(() => unref(user.info))
const storedAccounts = computed(() => unref(user.cookieTableData) ?? [])
const accountCount = computed(() => storedAccounts.value.length)
const currentUserLabel = computed(() => userInfo.value?.showName ?? userInfo.value?.name ?? '未识别当前页面账号')
const selectedUserLabel = computed(() => currentRow.value?.user ?? '尚未选择账号')

function getGenderTagColor(gender: CookieInfo['gender']) {
  switch (gender) {
    case 'man':
      return '#9BC1FE'
    case 'woman':
      return '#FFBDEB'
    default:
      return '#C8CED8'
  }
}

function getGenderLabel(gender: CookieInfo['gender']) {
  switch (gender) {
    case 'man':
      return '男'
    case 'woman':
      return '女'
    default:
      return '未知'
  }
}

async function handleCreate() {
  loading.value = true
  try {
    const uid = user.getUserId()
    if (uid == null) {
      try {
        await ElMessageBox.confirm(
          '要是不登录进行新账号创建，则当前的所有配置将丢失！',
          '请先登录',
          {
            confirmButtonText: '强制创建',
            cancelButtonText: '取消',
            type: 'warning',
          },
        )
      } catch {
        return
      }
    }
    const val = await user.saveUser({ uid })
    if (uid && val) {
      user.cookieDatas.value[uid] = val
    }
    ElMessage.success('账号已保存，正在清空Cookie并刷新页面')
    await user.clearUser()
    setTimeout(() => window.location.reload(), 1500)
  } catch (err) {
    logger.error('创建账号失败', err)
    ElMessage.error(`创建账号失败: ${err as string}`)
  } finally {
    loading.value = false
  }
}

async function handleChange() {
  loading.value = true
  try {
    if (!currentRow.value) {
      ElMessage.error('请先选择要切换的账号')
      return
    }
    const uid = user.getUserId()
    if (uid == null) {
      try {
        await ElMessageBox.confirm('要是不登录进行切换，则当前的所有配置将丢失！', '请先登录', {
          confirmButtonText: '强制切换',
          cancelButtonText: '取消',
          type: 'warning',
        })
      } catch {
        return
      }
    }
    await user.changeUser(currentRow.value)
    ElMessage.success('账号切换成功，即将刷新页面')
    setTimeout(() => window.location.reload(), 1500)
  } catch (err) {
    logger.error('账号切换失败', err)
    ElMessage.error('账号切换失败，请重试')
  } finally {
    loading.value = false
  }
}

function handleCurrentChange(val: CookieInfo | undefined) {
  currentRow.value = val
}
</script>

<template>
  <ElDialog
    v-model="show"
    class="user-center-dialog"
    width="92%"
    top="6vh"
    align-center
    destroy-on-close
    :z-index="20"
  >
    <template #header>
      <div class="user-center-dialog__header">
        <div class="user-center-dialog__title-block">
          <span class="user-center-dialog__eyebrow bh-eyebrow">Account Center</span>
          <h2>账户配置</h2>
          <p>统一管理已保存账号、切换目标账号，并在执行前确认当前页面登录身份。</p>
        </div>

        <div class="user-center-dialog__summary">
          <article class="user-center-dialog__summary-card bh-glass-surface bh-glass-surface--nested">
            <strong>{{ accountCount }}</strong>
            <span>已保存账号</span>
          </article>
          <article
            class="user-center-dialog__summary-card user-center-dialog__summary-card--wide bh-glass-surface bh-glass-surface--nested"
          >
            <strong>{{ currentUserLabel }}</strong>
            <span>当前页面账号</span>
          </article>
        </div>
      </div>
    </template>

    <div class="user-center-dialog__body">
      <div class="user-center-dialog__alerts">
        <ElAlert
          title="使用该功能会明文存储 Cookie 信息，可能包含隐私数据。"
          type="warning"
          show-icon
        />
        <ElAlert
          title="账号配置互相隔离，但历史投递统计仍是全局共享；切换后若发现未登录，通常是 Cookie 已过期。"
          type="info"
          show-icon
        />
        <ElAlert
          title="不要在未登录状态下创建或切换账号，否则当前配置无法被正确保存。"
          type="info"
          show-icon
        />
      </div>

      <section class="user-center-dialog__table-shell bh-glass-surface bh-glass-surface--nested">
        <div class="user-center-dialog__table-header">
          <div>
            <h3>账户列表</h3>
            <p>选择已保存账号后即可切换；删除操作会直接移除本地存档。</p>
          </div>

          <div class="user-center-dialog__selection-pill bh-glass-pill bh-glass-pill--accent">
            <span>当前选择</span>
            <strong>{{ selectedUserLabel }}</strong>
          </div>
        </div>

        <ElTable
          :data="storedAccounts"
          class="user-center-dialog__table"
          highlight-current-row
          table-layout="auto"
          empty-text="暂无已保存账号"
          @current-change="handleCurrentChange"
        >
          <ElTableColumn type="index" width="52" />
          <ElTableColumn label="账户">
            <template #default="scope">
              <div class="user-center-dialog__account-cell">
                <ElAvatar :src="scope.row.avatar" :size="36" />
                <span>{{ scope.row.user }}</span>
              </div>
            </template>
          </ElTableColumn>
          <ElTableColumn label="性别" align="center">
            <template #default="scope">
              <ElTag
                round
                effect="dark"
                style="border-style: none"
                :color="getGenderTagColor(scope.row.gender)"
              >
                {{ getGenderLabel(scope.row.gender) }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn label="身份" align="center">
            <template #default="scope">
              <ElTag
                effect="dark"
                round
                style="border-style: none"
                :type="scope.row.flag === 'student' ? 'success' : 'warning'"
              >
                {{ scope.row.flag === 'student' ? '学生' : '社畜' }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="date" label="上次登录" />
          <ElTableColumn fixed="right" label="操作" width="132">
            <template #default="scope">
              <ElButton link type="primary" size="small" disabled> 导出 </ElButton>
              <ElButton link type="danger" size="small" @click="() => user.deleteUser(scope.row)">
                删除
              </ElButton>
            </template>
          </ElTableColumn>
        </ElTable>
      </section>
    </div>

    <template #footer>
      <div class="user-center-dialog__footer">
        <div class="user-center-dialog__footer-copy">切换或新建后会刷新页面，以同步 Cookie 与配置。</div>

        <div class="user-center-dialog__footer-actions">
          <ElButton @click="show = false"> 取消 </ElButton>
          <ElPopconfirm title="确认后将保存数据退出账户并自动刷新" @confirm="handleCreate">
            <template #reference>
              <ElButton type="primary" :loading="loading"> 新建&登出 </ElButton>
            </template>
          </ElPopconfirm>
          <ElButton
            type="primary"
            :disabled="!currentRow"
            :loading="loading"
            @click="handleChange()"
          >
            切换
          </ElButton>
        </div>
      </div>
    </template>
  </ElDialog>
</template>

<style lang="scss" scoped>
.user-center-dialog__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  color: var(--bh-text-primary);
}

.user-center-dialog__eyebrow {
  margin-bottom: 8px;
}

.user-center-dialog__title-block h2 {
  margin: 0;
  font-size: clamp(1.7rem, 1.35rem + 0.8vw, 2.2rem);
  letter-spacing: -0.04em;
  color: var(--bh-text-primary);
}

.user-center-dialog__title-block p {
  margin: 10px 0 0;
  color: var(--bh-text-muted);
  line-height: 1.65;
}

.user-center-dialog__summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  min-width: min(420px, 100%);
}

.user-center-dialog__summary-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
  padding: 16px;
}

.user-center-dialog__summary-card--wide strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-center-dialog__summary-card strong {
  font-size: 1.08rem;
  color: var(--bh-text-primary);
}

.user-center-dialog__summary-card span,
.user-center-dialog__selection-pill span,
.user-center-dialog__footer-copy {
  color: var(--bh-text-muted);
}

.user-center-dialog__body {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.user-center-dialog__alerts {
  display: grid;
  gap: 10px;
}

.user-center-dialog__table-shell {
  padding: 18px;
}

.user-center-dialog__table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 14px;
}

.user-center-dialog__table-header h3 {
  margin: 0;
  font-size: 1.08rem;
  color: var(--bh-text-primary);
}

.user-center-dialog__table-header p {
  margin: 6px 0 0;
  color: var(--bh-text-muted);
  line-height: 1.6;
}

.user-center-dialog__selection-pill {
  display: flex;
  min-width: 220px;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
}

.user-center-dialog__selection-pill strong {
  font-size: 0.98rem;
  color: var(--bh-text-primary);
}

.user-center-dialog__account-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--bh-text-primary);
}

.user-center-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.user-center-dialog__footer-actions {
  display: inline-flex;
  gap: 12px;
}

.user-center-dialog :deep(.ehp-dialog) {
  color: var(--bh-text-primary);
  max-width: 1080px;
  overflow: hidden;
  border-radius: var(--bh-radius-dialog);
  border: 1px solid var(--bh-border-strong);
  background: var(--bh-surface-dialog);
  box-shadow: var(--bh-shadow-dialog);
  backdrop-filter: blur(var(--bh-blur-xl));
  -webkit-backdrop-filter: blur(var(--bh-blur-xl));
}

.user-center-dialog :deep(.ehp-dialog__header) {
  margin-right: 0;
  padding: 24px 24px 0;
}

.user-center-dialog :deep(.ehp-dialog__title),
.user-center-dialog :deep(.ehp-dialog__headerbtn),
.user-center-dialog :deep(.ehp-dialog__body),
.user-center-dialog :deep(.ehp-dialog__footer),
.user-center-dialog :deep(.ehp-table),
.user-center-dialog :deep(.ehp-table td.ehp-table__cell),
.user-center-dialog :deep(.ehp-table .cell),
.user-center-dialog :deep(.ehp-button),
.user-center-dialog :deep(.ehp-alert__title),
.user-center-dialog :deep(.ehp-alert__description) {
  color: var(--bh-text-primary);
}

.user-center-dialog :deep(.ehp-dialog__headerbtn .ehp-icon),
.user-center-dialog :deep(.ehp-button.is-link) {
  color: var(--bh-text-secondary);
}

.user-center-dialog :deep(.ehp-dialog__body) {
  padding: 20px 24px 0;
}

.user-center-dialog :deep(.ehp-dialog__footer) {
  padding: 18px 24px 24px;
}

.user-center-dialog :deep(.ehp-alert) {
  border-radius: var(--bh-radius-md);
}

.user-center-dialog :deep(.ehp-table) {
  --el-table-text-color: var(--bh-text-primary);
  --el-table-header-text-color: var(--bh-table-head-text);
  --el-table-row-hover-bg-color: var(--bh-table-current-row);
  --el-table-current-row-bg-color: var(--bh-table-current-row);
  --el-fill-color-light: transparent;
  --el-bg-color: transparent;
  --el-text-color-primary: var(--bh-text-primary);
  --el-text-color-regular: var(--bh-text-secondary);
  border-radius: var(--bh-radius-md);
  overflow: hidden;
}

.user-center-dialog :deep(.ehp-table__inner-wrapper),
.user-center-dialog :deep(.ehp-table__header-wrapper),
.user-center-dialog :deep(.ehp-table__body-wrapper) {
  background: transparent;
}

.user-center-dialog :deep(.ehp-table th.ehp-table__cell) {
  background: var(--bh-table-head-bg);
  color: var(--bh-table-head-text);
}

.user-center-dialog :deep(.ehp-table tr) {
  background: transparent;
}

.user-center-dialog :deep(.ehp-table__row.current-row > td.ehp-table__cell) {
  background: var(--bh-table-current-row);
}

@media (max-width: 900px) {
  .user-center-dialog__header,
  .user-center-dialog__summary,
  .user-center-dialog__footer,
  .user-center-dialog__table-header {
    grid-template-columns: 1fr;
    display: grid;
  }

  .user-center-dialog__summary,
  .user-center-dialog__footer-actions {
    width: 100%;
  }

  .user-center-dialog__footer-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .user-center-dialog__selection-pill {
    min-width: 0;
  }
}

@media (max-width: 640px) {
  .user-center-dialog__summary,
  .user-center-dialog__footer-actions {
    grid-template-columns: 1fr;
  }
}
</style>
