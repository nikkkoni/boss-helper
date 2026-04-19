<script lang="ts" setup>
import { ElAlert, ElButton, ElCheckbox, ElLink, ElPopover, ElSpace } from 'element-plus'

import Alert from '@/components/Alert'
import formItem from '@/components/form/FormItem.vue'
import formSelect from '@/components/form/FormSelect.vue'
import SalaryRangeComponent from '@/components/form/SalaryRange.vue'
import { useCommon } from '@/stores/common'
import { formInfoData, useConf } from '@/stores/conf'

const conf = useConf()
const { deliverLock } = useCommon()

function syncSalaryRange() {
  conf.formData.salaryRange.advancedValue.M[0] = Math.round(
    conf.formData.salaryRange.value[0] * 1000,
  )
  conf.formData.salaryRange.advancedValue.M[1] = Math.round(
    conf.formData.salaryRange.value[1] * 1000,
  )

  conf.formData.salaryRange.advancedValue.D[0] = Math.round(
    conf.formData.salaryRange.advancedValue.M[0] / 21.75,
  )
  conf.formData.salaryRange.advancedValue.D[1] = Math.round(
    conf.formData.salaryRange.advancedValue.M[1] / 21.75,
  )

  conf.formData.salaryRange.advancedValue.H[0] = Math.round(
    conf.formData.salaryRange.advancedValue.D[0] / 8,
  )
  conf.formData.salaryRange.advancedValue.H[1] = Math.round(
    conf.formData.salaryRange.advancedValue.D[1] / 8,
  )
}
</script>

<template>
  <Alert
    id="filter-config-alert-enable"
    title="复选框打钩才会启用，别忘记打钩启用哦。保存也别忘了"
    type="success"
    show-icon
    style="margin: 10px 0"
  />
  <Alert
    id="filter-config-alert-mode"
    title="排除和包含可点击切换，混合模式适用性过低不会考虑开发"
    type="success"
    show-icon
    style="margin: 10px 0"
  />

  <ElSpace class="config-input" wrap style="width: 100%">
    <form-item
      v-bind="formInfoData.company"
      v-model:enable="conf.formData.company.enable"
      v-model:include="conf.formData.company.include"
      :disabled="deliverLock"
    >
      <formSelect
        v-model:value="conf.formData.company.value"
        :options="conf.formData.company.options"
      />
    </form-item>
    <form-item
      v-bind="formInfoData.jobTitle"
      v-model:enable="conf.formData.jobTitle.enable"
      v-model:include="conf.formData.jobTitle.include"
      :disabled="deliverLock"
    >
      <form-select
        v-model:value="conf.formData.jobTitle.value"
        :options="conf.formData.jobTitle.options"
      />
    </form-item>
    <form-item
      v-bind="formInfoData.jobContent"
      v-model:enable="conf.formData.jobContent.enable"
      v-model:include="conf.formData.jobContent.include"
      :disabled="deliverLock"
    >
      <form-select
        v-model:value="conf.formData.jobContent.value"
        :options="conf.formData.jobContent.options"
      />
    </form-item>
    <form-item
      v-if="conf.config_level.intermediate"
      v-bind="formInfoData.hrPosition"
      v-model:enable="conf.formData.hrPosition.enable"
      v-model:include="conf.formData.hrPosition.include"
      :disabled="deliverLock"
    >
      <form-select
        v-model:value="conf.formData.hrPosition.value"
        :options="conf.formData.hrPosition.options"
      />
    </form-item>
    <form-item
      v-if="conf.config_level.intermediate"
      v-bind="formInfoData.jobAddress"
      v-model:enable="conf.formData.jobAddress.enable"
      :disabled="deliverLock"
    >
      <template #include>
        <ElLink type="primary" size="small"> 包含 </ElLink>
      </template>
      <form-select
        v-model:value="conf.formData.jobAddress.value"
        :options="conf.formData.jobAddress.options"
      />
    </form-item>
    <form-item
      v-if="conf.config_level.intermediate"
      v-bind="formInfoData.salaryRange"
      v-model:enable="conf.formData.salaryRange.enable"
    >
      <SalaryRangeComponent
        v-model:value="conf.formData.salaryRange.value"
        width="80px"
        unit="K"
        :show="false"
      />
      <ElPopover v-if="conf.config_level.advanced" placement="top" :width="400" trigger="click">
        <template #reference>
          <ElButton style="margin-left: 5px"> 高级 </ElButton>
        </template>
        <div style="display: flex; flex-direction: column; gap: 10px">
          <ElAlert
            title="宽松匹配: 薪资范围有任何重叠即匹配, 如10-20K: 15-20K, 15-21k, 20-26k 都满足, 21-22k 不满足"
            type="info"
            show-icon
            :closable="false"
          />
          <ElAlert
            title="严格匹配: 目标薪资需完全在职位范围内, 如10-20K: 10-15K 和15-20K 满足, 15-21k 不满足"
            type="info"
            show-icon
            :closable="false"
          />
          <SalaryRangeComponent
            v-model:value="conf.formData.salaryRange.value"
            unit="K"
            :show="true"
          />
          <ElAlert
            title="计算值进行同步，算法固定. 日薪: /21.75, 时薪: /21.75/8"
            type="info"
            show-icon
            :closable="false"
          />
          <ElButton @click="syncSalaryRange"> 同步 </ElButton>
          <SalaryRangeComponent
            v-model:value="conf.formData.salaryRange.advancedValue.H"
            unit="元/时"
            :show="true"
            :step="5"
          />
          <SalaryRangeComponent
            v-model:value="conf.formData.salaryRange.advancedValue.D"
            unit="元/天"
            :show="true"
            :step="10"
          />
          <SalaryRangeComponent
            v-model:value="conf.formData.salaryRange.advancedValue.M"
            unit="元/月"
            :show="true"
            :step="200"
          />
        </div>
      </ElPopover>
    </form-item>
    <form-item
      v-if="conf.config_level.intermediate"
      v-bind="formInfoData.companySizeRange"
      v-model:enable="conf.formData.companySizeRange.enable"
    >
      <SalaryRangeComponent
        :controls="false"
        v-model:value="conf.formData.companySizeRange.value"
        width="90px"
        unit="人"
        :show="true"
      />
    </form-item>

  </ElSpace>
  <ElSpace wrap>
    <ElCheckbox
      v-if="conf.config_level.intermediate"
      v-bind="formInfoData.activityFilter"
      v-model="conf.formData.activityFilter.value"
      border
    />
    <ElCheckbox
      v-bind="formInfoData.goldHunterFilter"
      v-model="conf.formData.goldHunterFilter.value"
      border
    />
    <ElCheckbox
      v-bind="formInfoData.friendStatus"
      v-model="conf.formData.friendStatus.value"
      border
    />
    <ElCheckbox
      v-if="conf.config_level.intermediate"
      v-bind="formInfoData.sameCompanyFilter"
      v-model="conf.formData.sameCompanyFilter.value"
      border
    />
    <ElCheckbox
      v-if="conf.config_level.intermediate"
      v-bind="formInfoData.sameHrFilter"
      v-model="conf.formData.sameHrFilter.value"
      border
    />
  </ElSpace>
</template>

<style lang="scss" scoped>
.config-input :deep(.ehp-space__item) {
  width: 48%;
}
</style>
