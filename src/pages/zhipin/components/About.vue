<script lang="ts" setup>
import { ElLink, ElSpace } from 'element-plus'
</script>

<template>
  <div class="about-grid">
    <section class="about-card" data-help="谢谢你的关心">
      <span class="about-card__eyebrow">Repository</span>
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

    <section class="about-card" data-help="记得来个Star或者好评吧">
      <span class="about-card__eyebrow">Docs</span>
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

    <section class="about-card about-card--accent" data-help=" ">
      <span class="about-card__eyebrow">Notes</span>
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
  border-radius: 24px;
  background: rgb(255 255 255 / 82%);
  box-shadow: inset 0 0 0 1px rgb(148 163 184 / 18%);
}

.about-card--accent {
  background: linear-gradient(135deg, rgb(15 118 110 / 10%), rgb(14 165 233 / 10%));
}

.about-card__eyebrow {
  display: inline-flex;
  margin-bottom: 8px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #0f766e;
}

.about-card h3 {
  margin: 0;
  font-size: 1.04rem;
}

.about-card p,
.about-card__list,
.about-card__links {
  margin-top: 10px;
  color: #475569;
  line-height: 1.75;
}

.about-card__list,
.about-card__links {
  display: grid;
  gap: 8px;
}

html.dark {
  .about-card {
    background: rgb(15 23 42 / 62%);
    box-shadow: inset 0 0 0 1px rgb(71 85 105 / 30%);
  }

  .about-card--accent {
    background: linear-gradient(135deg, rgb(14 165 233 / 14%), rgb(99 102 241 / 16%));
  }

  .about-card__eyebrow {
    color: #67e8f9;
  }

  .about-card p,
  .about-card__list,
  .about-card__links {
    color: #cbd5e1;
  }
}
</style>
