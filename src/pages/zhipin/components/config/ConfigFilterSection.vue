<script lang="ts" setup>
import { ElAlert, ElButton, ElCheckbox, ElLink, ElPopover } from 'element-plus'

import Alert from '@/components/Alert'
import formItem from '@/components/form/FormItem.vue'
import formSelect from '@/components/form/FormSelect.vue'
import SalaryRangeComponent from '@/components/form/SalaryRange.vue'
import { useCommon } from '@/stores/common'
import { formInfoData, useConf } from '@/stores/conf'

import ConfigSectionCard from './ConfigSectionCard.vue'

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
  <div class="config-filter">
    <div class="config-filter__tips">
      <Alert
        id="filter-config-alert-enable"
        title="复选框打钩才会启用，别忘记启用并在调整后保存配置。"
        type="success"
        show-icon
      />
      <Alert
        id="filter-config-alert-mode"
        title="包含和排除可点击切换，目前不考虑加入混合模式。"
        type="success"
        show-icon
      />
    </div>

    <div class="config-filter__sections">
      <ConfigSectionCard
        compact
        title="关键词与岗位条件"
        description="适合先定义公司、岗位名称和职位内容等核心边界。"
      >
        <div class="config-filter__fields">
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
            <formSelect
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
            <formSelect
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
            <formSelect
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
            <formSelect
              v-model:value="conf.formData.jobAddress.value"
              :options="conf.formData.jobAddress.options"
            />
          </form-item>
        </div>
      </ConfigSectionCard>

      <ConfigSectionCard
        v-if="conf.config_level.intermediate"
        compact
        title="范围与规模"
        description="用薪资和公司规模进一步收敛结果集，适合在基础筛选稳定后补充。"
      >
        <div class="config-filter__fields">
          <form-item
            v-bind="formInfoData.salaryRange"
            v-model:enable="conf.formData.salaryRange.enable"
          >
            <div class="config-filter__salary-row">
              <SalaryRangeComponent
                v-model:value="conf.formData.salaryRange.value"
                width="80px"
                unit="K"
                :show="false"
              />
              <ElPopover
                v-if="conf.config_level.advanced"
                placement="top"
                :width="400"
                trigger="click"
              >
                <template #reference>
                  <ElButton class="config-filter__advanced-button"> 高级 </ElButton>
                </template>
                <div class="config-filter__popover">
                  <ElAlert
                    title="宽松匹配: 薪资范围有任何重叠即匹配, 如10-20K: 15-20K, 15-21K, 20-26K 都满足, 21-22K 不满足"
                    type="info"
                    show-icon
                    :closable="false"
                  />
                  <ElAlert
                    title="严格匹配: 目标薪资需完全在职位范围内, 如10-20K: 10-15K 和15-20K 满足, 15-21K 不满足"
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
                    title="计算值进行同步，算法固定。日薪: /21.75，时薪: /21.75/8"
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
            </div>
          </form-item>
          <form-item
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
        </div>
      </ConfigSectionCard>

      <ConfigSectionCard
        compact
        title="附加限制"
        description="这些开关常用于控制重复投递、猎头过滤和沟通状态等补充规则。"
      >
        <div class="config-filter__toggles">
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
        </div>
      </ConfigSectionCard>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.config-filter {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.config-filter__tips {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.config-filter__sections {
  display: grid;
  gap: 16px;
}

.config-filter__fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 18px;
}

.config-filter__fields :deep(.ehp-form-item) {
  width: 100%;
  margin-right: 0;
  margin-bottom: 0;
}

.config-filter__fields :deep(.ehp-form-item__content),
.config-filter__fields :deep(.ehp-select),
.config-filter__fields :deep(.ehp-select-v2),
.config-filter__fields :deep(.ehp-input-number) {
  width: 100%;
}

.config-filter__salary-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  width: 100%;
}

.config-filter__advanced-button {
  margin-left: 0;
}

.config-filter__popover {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.config-filter__toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

@media (max-width: 960px) {
  .config-filter__tips,
  .config-filter__fields {
    grid-template-columns: 1fr;
  }
}
</style>
