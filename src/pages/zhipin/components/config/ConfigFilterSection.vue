<script lang="ts" setup>
import { ElAlert, ElButton, ElCheckbox, ElLink, ElPopover } from 'element-plus'
import { computed } from 'vue'

import Alert from '@/components/Alert'
import formItem from '@/components/form/FormItem.vue'
import formSelect from '@/components/form/FormSelect.vue'
import SalaryRangeComponent from '@/components/form/SalaryRange.vue'
import { useCommon } from '@/stores/common'
import { formInfoData, useConf } from '@/stores/conf'

import ConfigSectionCard from './ConfigSectionCard.vue'

const conf = useConf()
const { deliverLock } = useCommon()

type ToggleFieldKey =
  | 'activityFilter'
  | 'goldHunterFilter'
  | 'friendStatus'
  | 'sameCompanyFilter'
  | 'sameHrFilter'

type ToggleOption = {
  key: ToggleFieldKey
  label: string
  help?: string
  model: { value: boolean }
}

const toggleOptions = computed<ToggleOption[]>(() => [
  ...(conf.config_level.intermediate
    ? [
        {
          key: 'activityFilter' as const,
          label: formInfoData.activityFilter.label,
          help: formInfoData.activityFilter['data-help'],
          model: conf.formData.activityFilter,
        },
      ]
    : []),
  {
    key: 'goldHunterFilter',
    label: formInfoData.goldHunterFilter.label,
    help: formInfoData.goldHunterFilter['data-help'],
    model: conf.formData.goldHunterFilter,
  },
  {
    key: 'friendStatus',
    label: formInfoData.friendStatus.label,
    help: formInfoData.friendStatus['data-help'],
    model: conf.formData.friendStatus,
  },
  ...(conf.config_level.intermediate
    ? [
        {
          key: 'sameCompanyFilter' as const,
          label: formInfoData.sameCompanyFilter.label,
          help: formInfoData.sameCompanyFilter['data-help'],
          model: conf.formData.sameCompanyFilter,
        },
        {
          key: 'sameHrFilter' as const,
          label: formInfoData.sameHrFilter.label,
          help: formInfoData.sameHrFilter['data-help'],
          model: conf.formData.sameHrFilter,
        },
      ]
    : []),
])

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
        title="勾选启用后规则才会参与筛选，调整完成后记得保存配置。"
        type="success"
        show-icon
      />
      <Alert
        id="filter-config-alert-mode"
        title="包含 / 排除用于决定匹配方向，建议先定方向再补充关键词。"
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
        <template #actions>
          <span class="config-filter__meta bh-glass-pill">核心边界</span>
        </template>

        <div class="config-filter__fields">
          <div class="config-filter__field-card bh-glass-surface bh-glass-surface--nested">
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
          </div>

          <div class="config-filter__field-card bh-glass-surface bh-glass-surface--nested">
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
          </div>

          <div class="config-filter__field-card bh-glass-surface bh-glass-surface--nested">
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
          </div>

          <div
            v-if="conf.config_level.intermediate"
            class="config-filter__field-card bh-glass-surface bh-glass-surface--nested"
          >
            <form-item
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
          </div>

          <div
            v-if="conf.config_level.intermediate"
            class="config-filter__field-card bh-glass-surface bh-glass-surface--nested"
          >
            <form-item
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
        </div>
      </ConfigSectionCard>

      <ConfigSectionCard
        v-if="conf.config_level.intermediate"
        compact
        title="范围与规模"
        description="用薪资和公司规模进一步收敛结果集，适合在基础筛选稳定后补充。"
      >
        <template #actions>
          <span class="config-filter__meta bh-glass-pill">进阶约束</span>
        </template>

        <div class="config-filter__fields">
          <div class="config-filter__field-card bh-glass-surface bh-glass-surface--nested">
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
          </div>

          <div class="config-filter__field-card bh-glass-surface bh-glass-surface--nested">
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
        </div>
      </ConfigSectionCard>

      <ConfigSectionCard
        compact
        title="附加限制"
        description="这些开关常用于控制重复投递、猎头过滤和沟通状态等补充规则。"
      >
        <template #actions>
          <span class="config-filter__meta bh-glass-pill">去重与补充规则</span>
        </template>

        <div class="config-filter__toggle-grid">
          <div
            v-for="option in toggleOptions"
            :key="option.key"
            class="config-filter__toggle-card bh-glass-surface bh-glass-surface--nested"
            :data-help="option.help"
          >
            <div class="config-filter__toggle-copy">
              <strong>{{ option.label }}</strong>
              <p>{{ option.help }}</p>
            </div>
            <ElCheckbox v-model="option.model.value" border>
              {{ option.model.value ? '启用' : '关闭' }}
            </ElCheckbox>
          </div>
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
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
  gap: 12px;
}

.config-filter__sections {
  display: grid;
  gap: 16px;
}

.config-filter__meta {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  color: var(--bh-text-secondary);
  font-size: 0.8rem;
  font-weight: 700;
}

.config-filter__fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
  gap: 14px 18px;
}

.config-filter__field-card {
  padding: 14px;
  min-width: 0;
}

.config-filter__fields :deep(.ehp-form-item) {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  width: 100%;
  min-width: 0;
  margin-right: 0;
  margin-bottom: 0;
}

.config-filter__fields :deep(.ehp-form-item__label-wrap),
.config-filter__fields :deep(.ehp-form-item__label) {
  width: 100%;
  max-width: 100%;
}

.config-filter__fields :deep(.ehp-form-item__label) {
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  padding: 0;
  line-height: 1.4;
  white-space: normal;
}

.config-filter__fields :deep(.ehp-form-item__label .ehp-checkbox) {
  flex: 1 1 auto;
  min-width: 0;
  margin-right: 0;
}

.config-filter__fields :deep(.ehp-form-item__content),
.config-filter__fields :deep(.ehp-select),
.config-filter__fields :deep(.ehp-select-v2),
.config-filter__fields :deep(.ehp-input-number) {
  width: 100%;
  min-width: 0;
}

.config-filter__fields :deep(.ehp-form-item__content) {
  margin-left: 0 !important;
}

.config-filter__salary-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  width: 100%;
  min-width: 0;
}

.config-filter__advanced-button {
  margin-left: 0;
}

.config-filter__popover {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.config-filter__toggle-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
  gap: 12px;
}

.config-filter__toggle-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 14px;
  align-items: start;
  padding: 14px;
}

.config-filter__toggle-copy {
  min-width: 0;
}

.config-filter__toggle-copy strong {
  display: block;
  color: var(--bh-text-primary);
  font-size: 0.94rem;
  line-height: 1.35;
}

.config-filter__toggle-copy p {
  margin: 8px 0 0;
  color: var(--bh-text-muted);
  line-height: 1.6;
}

.config-filter__toggle-card :deep(.ehp-checkbox) {
  margin: 0;
  align-self: start;
}

@media (max-width: 640px) {
  .config-filter__toggle-card {
    grid-template-columns: 1fr;
  }
}
</style>
