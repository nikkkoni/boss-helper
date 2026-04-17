<script lang="ts" setup>
import { ElLink, ElSpace } from 'element-plus'
</script>

<template>
  <div>
    <div style="display: flex; align-items: center">
      <div class="hp-about" data-help="谢谢你的关心">
        <div data-help="当前仓库与说明文档都以这里的链接为准。">
          当前仓库:&#12288;
          <ElLink href="https://github.com/nikkkoni/boss-helper" target="_blank">
            nikkkoni/boss-helper
          </ElLink>
        </div>
        <div data-help="遇到安装、文档或行为问题时，优先使用当前仓库的 Issues。">
          <div>
            问题反馈:&#12288;
            <ElLink href="https://github.com/nikkkoni/boss-helper/issues" target="_blank">
              GitHub Issues
            </ElLink>
          </div>
          <div>
            发布页面:&#12288;
            <ElLink href="https://github.com/nikkkoni/boss-helper/releases" target="_blank">
              GitHub Releases
            </ElLink>
          </div>
        </div>
      </div>
    </div>
    <div data-help="记得来个Star或者好评吧" style="margin-top: 10px">
      当前仓库以浏览器扩展和本地自动化工具链为主
      <br />
      README:
      <ElLink href="https://github.com/nikkkoni/boss-helper#readme" target="_blank">
        https://github.com/nikkkoni/boss-helper#readme
      </ElLink>
      <br />
      文档目录:
      <ElLink href="https://github.com/nikkkoni/boss-helper/tree/main/docs" target="_blank">
        https://github.com/nikkkoni/boss-helper/tree/main/docs
      </ElLink>
      <br />
      <br />
      <ElSpace wrap>
        <ElLink href="https://github.com/nikkkoni/boss-helper" target="_blank"> GitHub </ElLink>
        <ElLink href="https://github.com/nikkkoni/boss-helper/issues" target="_blank">
          Issues
        </ElLink>
        <ElLink href="https://github.com/nikkkoni/boss-helper/pulls" target="_blank"> Pull Requests </ElLink>
      </ElSpace>
    </div>
    <div data-help=" " style="width: 60%; margin-top: 20px; user-select: text; color: #fff">
      当前仓库基于早期开源版本 fork 后持续演进。
      <br />
      安装方式、发布说明和反馈入口均以当前仓库 README 与 docs 为准，不再沿用历史 GreasyFork 或问卷链接。
    </div>
  </div>
</template>

<style lang="scss" scoped></style>
