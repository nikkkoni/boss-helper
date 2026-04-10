<script lang="ts" setup>
import { useCountdown } from '@vueuse/core'
import { useQRCode } from '@vueuse/integrations/useQRCode'
import {
  ElAlert,
  ElButton,
  ElButtonGroup,
  ElForm,
  ElFormItem,
  ElImageViewer,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElPopover,
  ElTable,
  ElTableColumn,
} from 'element-plus'
import { events } from 'fetch-event-stream'
import type { FetchResponse } from 'openapi-fetch'
import { h, watch } from 'vue'

import { computed, onMounted, ref } from '#imports'
import SafeHtml from '@/components/SafeHtml.vue'
import { useSignedKey } from '@/stores/signedKey'
import { useUser } from '@/stores/user'
import type { components } from '@/types/openapi'
import { jsonClone } from '@/utils/deepmerge'
import { logger } from '@/utils/logger'

import Ai from './Ai.vue'
import ServicePurchaseDialog from './service/ServicePurchaseDialog.vue'

const signedKey = useSignedKey()
const user = useUser()
const keyValue = ref(signedKey.signedKey ?? signedKey.signedKeyBak)
const loading = ref(false)
const buyDialogVisible = ref(false)
const buyDialogLoading = ref(false)
const buyQrcodeUrl = ref('')
const { remaining: buyExpireTime, start: startBuyExpireTime } = useCountdown(0)
const buyQrcode = useQRCode(buyQrcodeUrl, {
  width: 300,
  scale: 8,
  margin: 2,
  errorCorrectionLevel: 'H',
})
const buyResult = ref<typeof signedKey.signedKeyInfo>()
const buyDialogStatus = ref<'key' | 'account' | 'balance' | 'balanceSelect'>('key')
const balanceAmount = ref(10)
const balanceAmountCustom = ref(0)
const buyOrderName = ref('')
let buySignal: AbortController | null = null
const buyNotice = `<h2 id="-">须知</h2>
<p>密钥购买需要充值使用，首次购买赠送5元余额</p>
<p>密钥模型价格携带服务器/开发等成本，价格会高一些</p>
<p>密钥购买后将自动绑定当前账号，未登录不可购买</p>
<p>密钥购买后需要自行保管，绑定后会保存到浏览器会话存储中，关闭浏览器后需要重新绑定</p>
<p>不要将密钥公布和发到其他平台，造成余额盗刷概不负责</p>
<h2 id="-">服务</h2>
<ol>
<li>可直接使用各大模型，无需二次配置</li>
<li>可使用特别优化Prompt</li>
<li>优先技术支持</li>
<li>专属微信群</li>
</ol>
<h2 id="-">隐私收集</h2>
<ul>
<li>购买后将和账号id进行匹配，除此之外不再收集其他信息</li>
<li>仅使用模型，仅会记录 Prompt 和 Output</li>
<li>使用优化Prompt，才需要上传当前简历信息和岗位信息，进行Prompt优化</li>
</ul>`

async function bindKey() {
  loading.value = true
  try {
    if (keyValue.value == null) {
      ElMessage.error('请输入密钥')
      return
    }
    const data = await signedKey.getSignedKeyInfo(keyValue.value)
    if (data != null && data.key != null && data.users.length > 0) {
      const userID = user.getUserId()?.toString()
      if (userID == null) {
        ElMessage.error('请先登录')
        return
      }
      if (data.users.some((item) => item.user_id === userID)) {
        signedKey.signedKey = keyValue.value
        signedKey.signedKeyInfo = data
        ElMessage.success('绑定成功')
      } else {
        const resp = await signedKey.client.POST('/v1/key/bind_account', {
          body: {
            data: {
              user_id: userID,
              backup_user_id: user.info?.value?.encryptUserId,
            },
            signed_key: keyValue.value,
          },
        })
        const errMsg = signedKey.signedKeyReqHandler(resp)
        if (errMsg == null && resp.data != null) {
          signedKey.signedKey = resp.data.signed_key
          data.users.push(resp.data)
          signedKey.signedKeyInfo = data
          ElMessage.success('绑定成功')
        } else if (resp.response.status === 488) {
          const forcedResp = await signedKey.client.POST('/v1/key/bind_account', {
            body: {
              data: {
                user_id: userID,
                backup_user_id: user.info?.value?.encryptUserId,
              },
              callback: 'force_unbind',
              signed_key: keyValue.value,
            },
          })
          const forcedErrMsg = signedKey.signedKeyReqHandler(forcedResp)
          if (forcedErrMsg == null && forcedResp.data != null) {
            signedKey.signedKey = forcedResp.data.signed_key
            data.users.push(forcedResp.data)
            signedKey.signedKeyInfo = data
            ElMessage.success('绑定成功')
          }
        }
      }
    }
  } finally {
    loading.value = false
  }
}

const orderID = ref<string>()
const orderQuerySuccess = ref(false)

async function buy(
  responseFn: (userId: string, backupUserId?: string) => Promise<FetchResponse<any, any, any>>,
  shouldAssignKey = true,
) {
  loading.value = true
  buyResult.value = undefined
  buyQrcodeUrl.value = ''
  buyDialogVisible.value = true
  orderQuerySuccess.value = false
  try {
    buyDialogLoading.value = true
    const userId = user.getUserId()?.toString()
    const backupUserId = user.info?.value?.encryptUserId
    if (userId == null) {
      ElMessage.error('请先登录')
      return
    }
    const response = await responseFn(userId, backupUserId)
    const errMsg = signedKey.signedKeyReqHandler(response)
    if (errMsg != null) {
      return response
    }
    const stream = events(response.response)
    for await (const event of stream) {
      if (orderQuerySuccess.value) {
        continue
      }
      const { data } = event
      if (data == null) {
        continue
      }
      if (data === '[DONE]') {
        return
      }
      const resp = JSON.parse(data) as components['schemas']['OrderResp']
      if (resp.errmsg != null) {
        ElMessage.error(resp.errmsg)
      } else if (resp.order != null) {
        buyQrcodeUrl.value = resp.order.qr_code_url
        orderID.value = resp.order.order_id
        startBuyExpireTime((Date.parse(resp.order.expire_time) - Date.now()) / 1000)
      } else if (resp.key != null && resp.user != null) {
        const info = {
          key: resp.key,
          users: [resp.user],
        }
        if (shouldAssignKey) {
          signedKey.signedKeyInfo = jsonClone(info)
        }

        buyResult.value = jsonClone(info)
        keyValue.value = resp.key.signed_key
        ElMessage.success(resp.msg ?? '购买成功')
      }
    }
  } finally {
    buyDialogLoading.value = false
    loading.value = false
  }
}

async function queryOrder() {
  if (orderID.value == null) {
    ElMessage.error('无订单号')
    return
  }
  const res = await signedKey.client.POST('/v1/key/query_order', {
    body: {
      order_id: orderID.value,
    },
  })
  const errMsg = signedKey.signedKeyReqHandler(res)
  const resp = res.data
  if (errMsg != null || resp == null) {
    return
  }

  if (resp.key != null && resp.user != null) {
    const info = {
      key: resp.key,
      users: [resp.user],
    }

    buyResult.value = jsonClone(info)
    keyValue.value = resp.key.signed_key
    ElMessage.success(resp.msg ?? '购买成功')
    orderQuerySuccess.value = true
  } else if (resp.errmsg != null) {
    ElMessage.error(resp.errmsg)
  }
}

async function buyKey() {
  try {
    await ElMessageBox({
      title: '购前须知',
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      showCancelButton: true,
      message: () => h(SafeHtml, { tag: 'div', html: buyNotice }),
    })
  } catch {
    return
  }
  try {
    buyDialogStatus.value = 'key'
    buyOrderName.value = `购买密钥 ${signedKey.netConf?.price_info?.signedKey ?? 15}元`
    const response = await buy(async (userId: string, backupUserId?: string) => {
      buySignal = new AbortController()
      return signedKey.client.POST('/v1/key/purchase_key', {
        body: {
          data: {
            user_id: userId,
            backup_user_id: backupUserId,
          },
        },
        parseAs: 'stream',
        signal: buySignal.signal,
      })
    })
    if (response != null && response.response.status === 488) {
      try {
        const errMsg = signedKey.signedKeyReqHandler(response, false)
        await ElMessageBox.confirm(errMsg ?? '当前用户已绑定密钥，是否强制解绑?', '购买失败', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
        })
      } catch {
        return
      }
      await buy(async (userId: string, backupUserId?: string) => {
        buySignal = new AbortController()
        return signedKey.client.POST('/v1/key/purchase_key', {
          body: {
            data: {
              user_id: userId,
              backup_user_id: backupUserId,
            },
            callback: 'force_unbind',
          },
          parseAs: 'stream',
          signal: buySignal.signal,
        })
      })
    }
  } catch (error: any) {
    logger.error(error)
    ElMessage.error(`购买失败 ${error.message}`)
  }
}

async function buyAccount() {
  buyDialogStatus.value = 'account'
  buyOrderName.value = `购买账号位 ${signedKey.netConf?.price_info?.account ?? 5}元`
  await buy(async () => {
    buySignal = new AbortController()
    return signedKey.client.POST('/v1/key/purchase_account', {
      parseAs: 'stream',
      signal: buySignal.signal,
    })
  }, false)
}

async function buyBalance() {
  buyDialogStatus.value = 'balance'
  const amount = balanceAmount.value === -1 ? balanceAmountCustom.value : balanceAmount.value
  buyOrderName.value = `余额充值 ${amount}元`
  await buy(async () => {
    buySignal = new AbortController()
    return signedKey.client.POST('/v1/key/recharge_key', {
      body: {
        amount,
      },
      parseAs: 'stream',
      signal: buySignal.signal,
    })
  }, false)
}

function openBalance() {
  loading.value = true
  buyResult.value = undefined
  buyDialogVisible.value = true
  buyDialogStatus.value = 'balanceSelect'
}

function unbindKey() {
  keyValue.value = signedKey.signedKey
  signedKey.signedKey = ''
  signedKey.signedKeyInfo = undefined
}

function handleClose(done?: () => void) {
  const closeDialog = () => {
    if (done != null) {
      done()
    } else {
      buyDialogVisible.value = false
    }
    buyDialogLoading.value = false
    loading.value = false
    buySignal?.abort()
  }

  if (buyResult.value != null || buyDialogStatus.value === 'balanceSelect') {
    closeDialog()
    return
  }

  ElMessageBox.confirm('确定要关闭支付吗？', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
  })
    .then(() => {
      closeDialog()
    })
    .catch(() => {})
}

function setRemark(row: any) {
  ElMessageBox.prompt('请输入备注', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
  })
    .then(async ({ value }) => {
      const resp = await signedKey.client.PUT('/v1/key/remark', {
        body: {
          remark: value,
          id: row.id,
        },
      })
      signedKey.signedKeyReqHandler(resp)
      if (resp.error == null) {
        row.remark = value
        ElMessage.success('备注修改成功')
      }
    })
    .catch(() => {})
}

function copyKey() {
  navigator.clipboard.writeText(buyResult.value?.key.signed_key ?? '')
  ElMessage.success('密钥已复制到剪贴板')
}

async function updateResume() {
  try {
    loading.value = true
    await signedKey.updateResume()
  } finally {
    loading.value = false
  }
}

const showPreview = ref(false)
const srcList = ref<string[]>([])

async function contact() {
  const resp = await signedKey.client.GET('/v1/key/contact', {
    parseAs: 'blob',
  })
  const errMsg = signedKey.signedKeyReqHandler(resp)
  if (errMsg != null || resp.data == null) {
    return
  }
  const url = URL.createObjectURL(resp.data)
  srcList.value = [url]
  showPreview.value = true
}

const balance = computed(() => Number(signedKey.signedKeyInfo?.key?.balance ?? 0).toFixed(2))
const userAccount = computed(() => {
  return `${signedKey.signedKeyInfo?.users?.length ?? 0}/${signedKey.signedKeyInfo?.key?.user_capacity ?? 0}`
})

watch(
  () => signedKey.signedKeyBak,
  (value) => {
    keyValue.value = value
  },
)

onMounted(() => {
  if (signedKey.signedKey != null) {
    keyValue.value = signedKey.signedKey
    signedKey.signedKeyInfo = jsonClone(signedKey.signedKeyInfo)
  } else if (signedKey.signedKeyBak != null) {
    keyValue.value = signedKey.signedKeyBak
  }
  logger.info('signedKey', {
    keyValue,
    signedKey: signedKey.signedKey,
    signedKeyBak: signedKey.signedKeyBak,
  })
})
</script>

<template>
  <ElForm>
    <ElAlert
      style="margin-bottom: 10px"
      show-icon
      title="所有功能全免费使用，无任何限制包括AI功能。"
      description="但因脚本使用人数多维护难度大，也为了能照顾小白用户和脚本更好的维护推出密钥系统。并且代码整理完后也会继续开源供大家学习, 如购买出现问题可发邮件联系作者：boss-helper@ocyss.icu"
      type="success"
    />
    <ElFormItem class="bh-input-group">
      <ElInput
        v-show="!signedKey"
        v-model="keyValue"
        style="max-width: 300px"
        placeholder="boss-helper/01JPCJ..."
        size="small"
      />
      <div v-if="!!signedKey" style="font-size: 17px">
        <span>余额: {{ balance }}</span>
        <ElPopover placement="right" :width="400" trigger="click">
          <template #reference>
            <ElButton style="margin: 0 16px"> 账号位: {{ userAccount }} </ElButton>
          </template>
          <h3>账号列表</h3>
          <ElTable :data="signedKey.signedKeyInfo?.users">
            <ElTableColumn width="150" property="user_id" label="用户ID" />
            <ElTableColumn width="100" property="remark" label="备注" />
            <ElTableColumn label="操作">
              <template #default="scope">
                <ElButton link type="primary" size="small" @click.prevent="setRemark(scope.row)">
                  修改备注
                </ElButton>
              </template>
            </ElTableColumn>
          </ElTable>
        </ElPopover>
      </div>
      <ElButtonGroup style="margin-left: 10px">
        <template v-if="!signedKey.signedKey">
          <ElButton type="primary" :loading="loading" @click="bindKey"> 绑定密钥 </ElButton>
          <ElButton type="success" :loading="loading" @click="buyKey">
            购买密钥 {{ signedKey.netConf?.price_info?.signedKey ?? 15 }}元
          </ElButton>
        </template>
        <template v-else>
          <ElButton type="success" :loading="loading" @click="updateResume"> 更新简历 </ElButton>
          <ElButton type="success" :loading="loading" @click="openBalance"> 余额充值 </ElButton>
          <ElButton type="success" :loading="loading" @click="buyAccount">
            账号位 {{ signedKey.netConf?.price_info?.account ?? 5 }}元
          </ElButton>
          <ElButton type="success" :loading="loading" @click="contact"> 联系作者 </ElButton>
          <ElButton type="warning" :loading="loading" @click="unbindKey"> 解绑 </ElButton>
        </template>
      </ElButtonGroup>
    </ElFormItem>
    <ElImageViewer v-if="showPreview" :url-list="srcList" teleported @close="showPreview = false" />
    <Ai />
  </ElForm>

  <ServicePurchaseDialog
    v-model="buyDialogVisible"
    v-model:balanceAmount="balanceAmount"
    v-model:balanceAmountCustom="balanceAmountCustom"
    :buy-dialog-loading="buyDialogLoading"
    :buy-dialog-status="buyDialogStatus"
    :buy-expire-time="buyExpireTime"
    :buy-order-name="buyOrderName"
    :buy-qrcode="buyQrcode"
    :buy-result="buyResult"
    @close="handleClose()"
    @copy="copyKey()"
    @generate-balance="buyBalance()"
    @query-order="queryOrder"
  />
</template>

<style lang="scss" scoped>
.bh-input-group {
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>
