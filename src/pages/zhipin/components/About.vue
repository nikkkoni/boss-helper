<script lang="ts" setup>
import { ElLink, ElSpace } from 'element-plus'
</script>

<template>
  <div class="about-grid">
    <section
      class="about-card bh-glass-surface bh-glass-surface--nested"
      data-help="查看当前仓库、Issue 和发布页入口。"
    >
      <span class="about-card__eyebrow bh-eyebrow">Repository</span>
      <h3>当前仓库与反馈入口</h3>
      <div class="about-card__list">
        <div data-help="当前仓库与说明文档都以这里的链接为准。">
          当前仓库:
          <ElLink href="https://github.com/nikkkoni/boss-helper" target="_blank">
            nikkkoni/boss-helper
          </ElLink>
        </div>
        <div data-help="遇到安装、文档或行为问题时，优先使用当前仓库的 Issues。">
          问题反馈:
          <ElLink href="https://github.com/nikkkoni/boss-helper/issues" target="_blank">
            GitHub Issues
          </ElLink>
        </div>
        <div>
          发布页面:
          <ElLink href="https://github.com/nikkkoni/boss-helper/releases" target="_blank">
            GitHub Releases
          </ElLink>
        </div>
      </div>
    </section>

    <section
      class="about-card bh-glass-surface bh-glass-surface--nested"
      data-help="查看 README、docs 和发布相关文档入口。"
    >
      <span class="about-card__eyebrow bh-eyebrow">Docs</span>
      <h3>文档与发布信息</h3>
      <p>当前仓库以浏览器扩展和本地自动化工具链为主。</p>
      <div class="about-card__links">
        <div>
          README:
          <ElLink href="https://github.com/nikkkoni/boss-helper#readme" target="_blank">
            github.com/nikkkoni/boss-helper#readme
          </ElLink>
        </div>
        <div>
          文档目录:
          <ElLink href="https://github.com/nikkkoni/boss-helper/tree/main/docs" target="_blank">
            github.com/nikkkoni/boss-helper/tree/main/docs
          </ElLink>
        </div>
      </div>
      <ElSpace wrap>
        <ElLink href="https://github.com/nikkkoni/boss-helper" target="_blank"> GitHub </ElLink>
        <ElLink href="https://github.com/nikkkoni/boss-helper/issues" target="_blank">
          Issues
        </ElLink>
        <ElLink href="https://github.com/nikkkoni/boss-helper/pulls" target="_blank"> Pull Requests </ElLink>
      </ElSpace>
    </section>

    <section
      class="about-card about-card--accent bh-glass-surface bh-glass-surface--soft"
      data-help="说明当前仓库和历史来源之间的关系，以及应以哪里为准。"
    >
      <span class="about-card__eyebrow bh-eyebrow">Notes</span>
      <p>
        当前仓库基于早期开源版本 fork 后持续演进。安装方式、发布说明和反馈入口均以当前仓库
        README 与 docs 为准，不再沿用历史 GreasyFork 或问卷链接。
      </p>
    </section>
  </div>
</template>

<style lang="scss" scoped>
.about-grid {
  display: grid;
  gap: 16px;
}

.about-card {
  padding: 20px;
}

.about-card--accent {
  --bh-glass-bg: var(--bh-surface-pill-accent);
}

.about-card__eyebrow {
  margin-bottom: 8px;
}

.about-card h3 {
  margin: 0;
  font-size: 1.04rem;
}

.about-card p,
.about-card__list,
.about-card__links {
  margin-top: 10px;
  color: var(--bh-text-secondary);
  line-height: 1.75;
}

.about-card__list,
.about-card__links {
  display: grid;
  gap: 8px;
}

</style>
