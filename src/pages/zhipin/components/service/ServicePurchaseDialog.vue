<script lang="ts" setup>
import {
  ElAlert,
  ElButton,
  ElDialog,
  ElImage,
  ElInput,
  ElInputNumber,
  ElRadio,
  ElRadioGroup,
  ElSpace,
} from 'element-plus'

import type { components } from '@/types/openapi'

defineProps<{
  buyDialogLoading: boolean
  buyDialogStatus: 'key' | 'account' | 'balance' | 'balanceSelect'
  buyExpireTime: number
  buyOrderName: string
  buyQrcode: string
  buyResult?: components['schemas']['KeyInfo']
}>()

const buyDialogVisible = defineModel<boolean>({ required: true })
const balanceAmount = defineModel<number>('balanceAmount', { required: true })
const balanceAmountCustom = defineModel<number>('balanceAmountCustom', { required: true })

defineEmits<{
  close: []
  copy: []
  generateBalance: []
  queryOrder: []
}>()
</script>

<template>
  <ElDialog
    v-model="buyDialogVisible"
    :title="buyDialogStatus === 'balanceSelect' ? '余额充值' : '支付'"
    width="500"
    :before-close="() => $emit('close')"
  >
    <div v-if="buyDialogStatus === 'balanceSelect'" class="bh-buy-dialog">
      <ElRadioGroup v-model="balanceAmount" size="large">
        <ElSpace wrap>
          <ElRadio
            v-for="item in [1, 3, 5, 10, 20, 30, 50, 100]"
            :key="item"
            border
            :label="item"
            :value="item"
          >
            {{ item }}元
          </ElRadio>
          <ElRadio border label="自定义" :value="-1">
            <ElInputNumber
              v-model="balanceAmountCustom"
              style="width: 80px"
              :precision="2"
              :step="1"
              :min="1"
              :max="9999"
              size="small"
              :controls="false"
            />
          </ElRadio>
        </ElSpace>
      </ElRadioGroup>
    </div>
    <div v-else-if="buyResult == null" class="bh-buy-dialog">
      <div class="payment-brand">微信支付</div>
      <div style="margin-top: 6px; font-size: 18px"><b>商品名：</b>{{ buyOrderName }}</div>
      <div style="margin-top: 6px; font-size: 18px">
        <b>剩余时间：</b
        >{{
          Math.floor(buyExpireTime / 60)
            .toString()
            .padStart(2, '0')
        }}:{{
          Math.floor(buyExpireTime % 60)
            .toString()
            .padStart(2, '0')
        }}
      </div>
      <ElImage
        style="width: 300px; height: 300px"
        :src="buyQrcode"
        :zoom-rate="1.2"
        :max-scale="7"
        :min-scale="0.2"
        :preview-src-list="[buyQrcode]"
        show-progress
        :initial-index="4"
        fit="cover"
      />
    </div>
    <div v-else class="bh-buy-dialog">
      <div class="success-title">
        <span style="font-size: 22px">支付成功</span>
      </div>
      <div class="order-info"><b>商品名：</b>{{ buyOrderName }}</div>
      <ElAlert
        title="请妥善保管密钥，丢失无法找回"
        type="warning"
        :closable="false"
        show-icon
        style="margin: 15px 0"
      />
      <ElInput
        v-model="buyResult.key.signed_key"
        type="textarea"
        :rows="3"
        placeholder="密钥"
        readonly
        style="width: 100%; margin-top: 10px"
      >
        <template #prepend> 密钥 </template>
      </ElInput>
    </div>

    <template #footer>
      <div v-if="buyDialogStatus === 'balanceSelect'" class="dialog-footer">
        <ElButton type="primary" @click="$emit('close')"> 取消 </ElButton>
        <ElButton type="primary" @click="$emit('generateBalance')"> 生成订单 </ElButton>
      </div>
      <div v-else-if="buyResult == null" class="dialog-footer">
        <ElButton @click="$emit('close')"> 取消 </ElButton>
        <ElButton type="primary" @click="$emit('queryOrder')"> 我已经支付 </ElButton>
      </div>
      <div v-else class="dialog-footer">
        <ElButton type="primary" @click="$emit('copy')"> 复制密钥 </ElButton>
        <ElButton type="primary" @click="buyDialogVisible = false"> 我已经保存好密钥 </ElButton>
      </div>
    </template>
  </ElDialog>
</template>

<style lang="scss" scoped>
.bh-buy-dialog {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.payment-brand {
  font-size: 24px;
  font-weight: 700;
  color: #22ae1c;
}
</style>

<style>
.ehp-radio .ehp-input-number.is-without-controls .ehp-input__wrapper {
  padding: 0;
}
</style>
