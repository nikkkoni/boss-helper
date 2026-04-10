<script lang="ts" setup>
import { ElAvatar, ElIcon } from 'element-plus'
import { ref, watch } from 'vue'
import type { RecycleScrollerInstance } from 'vue-virtual-scroller'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'

import SafeHtml from '@/components/SafeHtml.vue'
import { useChat } from '@/composables/useChat'

import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'

const { chatMessages } = useChat()
const messageScroller = ref<RecycleScrollerInstance>()

watch(
  () => chatMessages.value.length,
  () => {
    messageScroller.value?.scrollToBottom()
  },
)
</script>

<template>
  <div class="chat-main">
    <!-- <div class="chat-header">选择框</div> -->
    <DynamicScroller
      ref="messageScroller"
      :items="chatMessages"
      :min-item-size="100"
      class="chat-message"
    >
      <template #default="{ item, index, active }">
        <DynamicScrollerItem
          :item="item"
          :active="active"
          :size-dependencies="[item.content]"
          :data-index="index"
          class="message"
          :class="{ self: item.role !== 'boss' }"
        >
          <div class="message-wrapper">
            <div class="message-content">
              <h6 class="text-dark">
                {{ item.name }}
              </h6>
              <span>{{ item.content }}</span>
            </div>
          </div>
          <div class="message-options">
            <ElAvatar
              :src="typeof item.avatar === 'string' ? item.avatar : undefined"
              :style="{
                '--el-avatar-bg-color': typeof item.avatar !== 'string' && item.avatar?.color,
              }"
            >
              <ElIcon v-if="item.avatar && typeof item.avatar !== 'string'" size="large">
                <SafeHtml tag="span" variant="svg" :html="item.avatar.icon" />
              </ElIcon>
            </ElAvatar>
            <span class="message-date">
              <span class="date">{{ item.date[0] }}&nbsp;&nbsp;</span>
              <span class="time">{{ item.date[1] }}</span>
            </span>
          </div>
          <div style="height: 1.25rem" />
        </DynamicScrollerItem>
      </template>
    </DynamicScroller>
  </div>
</template>

<style lang="scss" scoped>
.chat-message {
  flex: 1;
  &::-webkit-scrollbar {
    display: none;
  }
}
.message {
  font-size: 0.875rem;
  .message-content {
    padding: 1rem;
    background-color: #ffffff;
    color: #2a2a2a;
    html.dark & {
      background-color: #33393f;
      color: #dedee1;
      h6 {
        color: #ffffff;
      }
    }

    margin-right: 1.25rem;
    margin-left: 1.25rem;
    border-radius: 1.25rem;
    text-align: left;
    display: inline-block;
    max-width: 25rem;
    h6 {
      font-size: 0.975rem;

      color: #000000;
    }
    span {
      word-break: break-all;
      white-space: break-spaces;
    }
  }
  .message-options {
    display: inline-flex;
    align-items: center;
    font-size: 0.75rem;
    color: #adb5bd;
    margin-top: 0.3125rem;
    > * {
      margin-left: 0.3125rem;
      margin-right: 0.3125rem;
    }
    .ehp-avatar {
      margin-top: -1.25rem;
      height: 2.25rem;
      width: 2.25rem;
      min-width: 2.25rem;

      overflow: unset;
      box-shadow: 0 0 1px 1px rgba(0, 0, 0, 0.1);
      box-shadow: 0 0 0 0.5rem var(--body-bg-color);
      :deep(img) {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        -o-object-fit: cover;
        object-fit: cover;
        display: flex;
        align-items: center;
        justify-content: center;
        vertical-align: middle;
        border-style: none;
      }
    }
    .message-date {
      height: 1.125rem;
      line-height: 1.125rem;
      display: inline-block;
      vertical-align: middle;
      .date {
        display: none;
      }
      &:hover .date {
        display: inline-block;
      }
    }
  }

  &.self {
    text-align: right;
    h6 {
      display: none;
    }
    .message-content {
      background-color: #b4e9e8;
      html.dark & {
        background-color: #236e69;
      }
    }
    .message-options {
      flex-direction: row-reverse;
    }
  }
}
</style>
