<template>
  <router-view />
  <aside class="demo-notice" role="status">
    MiroFish 前端体验页 · 无后端，图谱生成与推演暂不可用。上传文件和需求仅暂存于当前浏览器页面，不会发送到服务器。
  </aside>
</template>

<script setup>
// 使用 Vue Router 来管理页面
</script>

<style>
/* 全局样式重置 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

#app {
  font-family: 'JetBrains Mono', 'Space Grotesk', 'Noto Sans SC', monospace;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #000000;
  background-color: #ffffff;
}

/* 滚动条样式 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #f1f1f1;
}

::-webkit-scrollbar-thumb {
  background: #000000;
}

::-webkit-scrollbar-thumb:hover {
  background: #333333;
}

/* 全局按钮样式 */
button {
  font-family: inherit;
}

.demo-notice {
  position: fixed;
  z-index: 9999;
  right: 16px;
  bottom: 16px;
  max-width: min(560px, calc(100vw - 32px));
  padding: 12px 16px;
  color: #fff;
  background: #161616;
  border: 1px solid #ff6a33;
  border-radius: 10px;
  box-shadow: 0 4px 16px #0003;
  font-size: 13px;
  line-height: 1.5;
}
</style>
