# dsh-ask-assistant

给 [DeepSeek Harness](https://github.com/deepseek-ai)（下称 DSH）桌面版加一个**「问助理」按钮**：点它就用右侧栏的内置浏览器打开 DeepSeek 网页版对话。随手查个东西、问个小事不必新开一个 DSH 会话，也就不消耗会话 token、不污染工作区上下文。

> 截图占位：安装后在侧边栏底部动作区（展开态 + 收起态）各截一张，放到 `docs/images/sidebar-button.png` 并把下面这行的注释去掉。
>
> <!-- ![侧边栏底部的问助理按钮](docs/images/sidebar-button.png) -->

## 特性

- **官方插槽，不改 asar**：按钮挂在 DSH 官方的侧边栏底部动作插槽（`sidebar.footer.action`）里，和「设置」齿轮同一行；侧边栏展开、收起两种状态都由 DSH 自己排版。
- **不依赖哈希类名**：不使用 `._2H3hWW_newSession` 这类 CSS Modules 哈希选择器，DSH 升级换样式也不会失效；也不用 `MutationObserver` 去硬插节点。
- **复用内置浏览器**：点按钮走官方 `sidebarRight.openTab('browser', …)`，在右侧栏开一个内置浏览器标签页加载 `https://chat.deepseek.com`，登录态与浏览器分区由 DSH 自己管理。
- **可配置地址**：想换成别的问答站点，改 `lib/client.js` 顶部的 `ASSISTANT_URL` 即可。
- **零依赖**：宿主半边只有一个空壳插件；浏览器半边只 `require('react')` 与 `@deepseek-ai/dsh-client-ui-primitives`，两个都由 DSH 前端自带。

## 安装

### 方式一：本地链接安装（推荐，改代码即时生效）

```powershell
# 1. 把插件目录放到任意位置，例如 C:\Users\<你>\.dsh\plugins\dsh-ask-assistant

# 2. 在 DSH profile 的 package.json 里登记依赖（link: 指向插件目录，路径用正斜杠）
#    "dsh-ask-assistant": "link:C:/Users/<你>/.dsh/plugins/dsh-ask-assistant"

# 3. 在同一个 package.json 的 dsh.profile.bundles 数组末尾加一项
#    "dsh-ask-assistant"

# 4. 建好 node_modules 里的链接（任选其一）
#    a) pnpm install        —— 干净环境最省事
#    b) 手动建 junction     —— pnpm 供应链策略拦住时的替代做法
New-Item -ItemType Junction `
  -Path   "C:\Users\<你>\.dsh\profiles\desktop\node_modules\dsh-ask-assistant" `
  -Target "C:\Users\<你>\.dsh\plugins\dsh-ask-assistant"

# 5. 完全退出 DSH 再启动
```

### 方式二：npm 安装（发布之后）

```powershell
cd C:\Users\<你>\.dsh\profiles\desktop
pnpm add dsh-ask-assistant
```

然后把 `dsh-ask-assistant` 加进 `package.json` 的 `dsh.profile.bundles`，重启 DSH。

## 挂载方式：bundle 还是 patch？

包内 `cordis.patch.yml` 提供了两种挂载通道，**二选一，不要同时用**：

- **bundle 通道（推荐）**：把包名加进 `dsh.profile.bundles`，DSH 会读 `package.json` 的 `dsh.bundle.patch`，自动加载包内补丁层里的 `insert` 条目。
- **patch 通道**：在 profile 的 `cordis.patch.yml` 末尾自己写：

  ```yaml
  - insert:
      - id: ask-assistant
        name: 'dsh-ask-assistant'
  ```

  ⚠️ 这里必须写**包名**，不要写成 `./cordis.patch.yml` 之类的相对路径：patch 的解析基准会落在这个包自己的目录里，向上找不到 profile 的 `node_modules`，加载会失败。

两条通道同时开会出现两个按钮，所以选了 bundle 通道就不要再往 profile 补丁里写。

## 卸载

1. 从 `package.json` 的 `dsh.profile.bundles` 里删掉 `dsh-ask-assistant`（如果用的是 patch 通道，删掉那段 `insert`）；
2. 删掉 `node_modules/dsh-ask-assistant` 链接，以及 dependencies 里的那一行；
3. 重启 DSH。

插件本身不写任何配置文件，卸载后除了按钮消失不会有残留。

## 开发

```
dsh-ask-assistant/
├── package.json          # dsh.bundle.patch 指向 cordis.patch.yml；dsh.client 声明浏览器半边
├── cordis.patch.yml      # bundle 层：insert 一个 id 为 ask-assistant 的插件条目
├── lib/
│   ├── index.js          # 宿主半边（空壳，只有 name / inject / apply）
│   └── client.js         # 浏览器半边：注册 sidebar.footer.action 插槽组件
└── test/
    └── test_plugin.mjs   # 离线自检：假 ModuleLoader + 假 ctx + 假 React
```

自检不需要安装任何依赖：

```powershell
node test/test_plugin.mjs
# dsh-ask-assistant 自检通过：4 组用例
```

### 客户端半边的关键点

```js
ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
  name: 'sidebar.footer.action',
  id: 'ask-assistant',               // 同一插槽里区分不同插件
  locale: 'askAssistant',            // 文案命名空间
  inject: () => ({ openAssistant })  // 往组件里注入回调
}, AskAssistantButton));
```

组件签名是 `({ wide, t, ...注入的属性 })`：

- `wide` 由插槽提供，侧边栏收起时是 `false`（用来在 14px / 16px 图标间切换）；
- `t` 是宿主按 `locale` 命名空间绑好的翻译函数（`locale.bind(ns)`），**不是** `locale.t(key)`；
- 文案用 `ctx.get('locale').register('askAssistant', { zh: {...}, en: {...} })` 注册，随 `ctx.effect` 自动注销。

### 改动后的生效方式

浏览器半边由 DSH 前端在启动时按 `package.json` 的 `dsh.client` 打包加载，**改完 `lib/client.js` 需要重启 DSH 桌面端**。

## 兼容性

- 依赖的公开面只有三样：cordis 的 `ctx.get`、官方插槽名 `sidebar.footer.action`、官方服务名 `sidebarRight`。三者都由 DSH 官方客户端插件注册。
- 若宿主缺少 `sidebarRight`（比如以后的版本改名），按钮仍在，但点击不会有反应——不会报错、不影响其它功能。
- 在 DSH Desktop 2.0.21（`@deepseek-ai/*` 0.2.1-rc.2）上开发与验证。

## 与内置「问助理」按钮的关系

部分 DSH 版本的侧边栏已经内置了一个「问助理」按钮（在「新会话」下面）。本插件**不覆盖也不替代**它，而是把同样的能力再放一个到侧边栏底部动作区，方便在侧边栏收起、或长会话列表把顶部按钮挤走时仍然一点就到。

如果你的 DSH 版本已经内置了满意的入口，可以不用装本插件。

## 许可

[MIT](LICENSE)
