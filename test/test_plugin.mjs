/**
 * 离线自检：用假的 `window.__ModuleLoader__`、假的 cordis 上下文和一个极简的
 * React 元素工厂，跑一遍 dsh-ask-assistant 的客户端半边，确认：
 *   1. 模块能被工厂函数构造出来，且导出了 apply / inject；
 *   2. apply 会往官方插槽 sidebar.footer.action 注册一个组件；
 *   3. 组件渲染出的节点结构符合预期（外壳 div + button + aria-label + svg）；
 *   4. 点击回调会调用 sidebarRight.openTab('browser', { params: { url } })；
 *   5. sidebarRight 缺席时不抛异常；
 *   6. locale 服务缺席时回退到内置中文词典；locale 服务在场时用它的 bind(ns)；
 *   7. 底栏容器会被打上定位标记，释放后标记被清理。
 *
 * 用法：node test/test_plugin.mjs（不需要安装依赖，不需要启动 DSH）。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const clientPath = join(here, '..', 'lib', 'client.js');
const source = readFileSync(clientPath, 'utf8');

/** 收集测试期间创建的所有假 DOM 节点。 */
let created = [];

/** 极简 DOM 桩：只实现插件实际用到的几个成员。 */
function makeFakeDocument() {
  const head = {
    appended: [],
    appendChild(node) {
      this.appended.push(node);
      created.push(node);
      return node;
    }
  };
  const body = {
    // 自检不需要真的挂载组件，querySelectorAll 一律返回空
    querySelectorAll() {
      return [];
    }
  };
  return {
    head,
    body,
    querySelector() {
      return head.appended.find((node) => node.attrs['data-dsh-ask-assistant-css'] === '1') ?? null;
    },
    querySelectorAll() {
      return [];
    },
    createElement(tag) {
      const node = {
        tag,
        attrs: {},
        textContent: '',
        setAttribute(name, value) {
          this.attrs[name] = value;
        }
      };
      created.push(node);
      return node;
    }
  };
}

/** 假 React：只做 createElement 的形状，够断言用。 */
const fakeReact = {
  createElement(type, props, ...children) {
    if (type === undefined) throw new Error('createElement 收到了 undefined 组件');
    return { type: typeof type === 'function' ? type.name : type, props: props ?? {}, children };
  }
};

/** 假 primitives：故意不给图标，验证手写 SVG 的兜底路径。 */
const fakePrimitives = {};

/**
 * 假 locale 服务，签名与官方 @deepseek-ai/dsh-client-locale 一致：
 * register(ns, dicts) / bind(ns) / translate(ns, key, params)。
 */
function makeLocale() {
  const dicts = new Map();
  const service = {
    register(namespace, table) {
      dicts.set(namespace, table);
      return () => dicts.delete(namespace);
    },
    bind(namespace) {
      return (key, params) => service.translate(namespace, key, params);
    },
    translate(namespace, key) {
      const table = dicts.get(namespace);
      const want = table?.zh ?? table?.en;
      return want?.[key] ?? key;
    }
  };
  return service;
}

/** 加载客户端半边，返回它导出的模块与注册记录。 */
function loadPlugin({ locale, sidebarRight }) {
  let loaded = null;
  const context = {
    window: {
      __ModuleLoader__: {
        load(spec) {
          loaded = spec.factory((name) => {
            if (name === 'react') return fakeReact;
            if (name === '@deepseek-ai/dsh-client-ui-primitives') return fakePrimitives;
            throw new Error('未预期的 require：' + name);
          });
        }
      }
    },
    document: makeFakeDocument(),
    navigator: { language: 'zh-CN' },
    console
  };
  vm.createContext(context);
  vm.runInContext(source, context);

  assert.ok(loaded !== null, '插件没有调用 window.__ModuleLoader__.load');
  assert.equal(typeof loaded.apply, 'function', '插件没有导出 apply');
  assert.deepEqual([...loaded.inject], [], 'inject 应为空数组');

  const registered = [];
  const disposers = [];
  const ctx = {
    get(name) {
      if (name === 'sidebarRight') return sidebarRight;
      if (name === 'locale') return locale;
      return undefined;
    },
    effect(factory, label) {
      const dispose = factory();
      if (typeof dispose === 'function') disposers.push({ label, dispose });
      return () => {};
    },
    slots: {
      inject(slotName, factory) {
        const dispose = factory();
        if (typeof dispose === 'function') disposers.push({ label: slotName, dispose });
      },
      register(spec, Component) {
        registered.push({ spec, Component });
        return () => {
          const index = registered.findIndex((row) => row.Component === Component);
          if (index >= 0) registered.splice(index, 1);
        };
      }
    }
  };

  loaded.apply(ctx);
  return { module: loaded, registered, disposers, ctx };
}

// —— 用例 1：正常注册、渲染与点击 ——
{
  created = [];
  const locale = makeLocale();
  const calls = [];
  const sidebarRight = { openTab: (kind, options) => calls.push({ kind, options }) };
  const { registered, disposers } = loadPlugin({ locale, sidebarRight });

  assert.equal(registered.length, 1, '应当注册一个插槽组件');
  const { spec, Component } = registered[0];
  assert.equal(spec.name, 'sidebar.footer.action', '必须注册到官方底部动作插槽');
  assert.equal(spec.id, 'ask-assistant');
  assert.equal(spec.locale, 'askAssistant', '插槽的 locale 命名空间应当指向本插件词典');

  // 注入的属性里应当带 openAssistant 回调
  const injected = spec.inject();
  assert.equal(typeof injected.openAssistant, 'function');

  // 渲染：外壳 div 里才是 button，便于给底栏容器打标记
  const t = locale.bind('askAssistant');
  const view = Component({ ...injected, wide: true, t });
  assert.equal(view.type, 'div');
  assert.equal(view.props.className, 'dsk-aa-footer');
  const button = view.children[0];
  assert.equal(button.type, 'button');
  assert.equal(button.props.type, 'button');
  assert.equal(button.props['aria-label'], '问助理');
  assert.equal(button.children.length, 1, '宽态与收起态都只放一个图标');
  assert.equal(button.children[0].type, 'GlobeIcon');

  // 触发点击 → sidebarRight.openTab
  // 注意：vm 沙箱里创建的数组/对象原型与外部不同，所以按字段断言而不是 deepEqual
  button.props.onClick();
  assert.equal(calls.length, 1, '点击应当只打开一个标签页');
  assert.equal(calls[0].kind, 'browser');
  assert.equal(calls[0].options.params.url, 'https://chat.deepseek.com');

  // 收起态也要能点（插槽两种状态都渲染同一个组件）
  const rail = Component({ ...injected, wide: false, t });
  rail.children[0].props.onClick();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.params.url, 'https://chat.deepseek.com');

  // 样式只注入一次（假 head 会记录两次 appendChild，按节点去重后应当只有一个 style）
  const styleNodes = new Set(created.filter((node) => node.tag === 'style'));
  assert.equal(styleNodes.size, 1, '样式节点应当只有一个');

  // 释放后插槽注册应当被撤销
  for (const row of disposers) row.dispose();
  assert.equal(registered.length, 0, '释放后应当注销插槽组件');
  assert.equal(locale.translate('askAssistant', 'open'), 'open', '释放后文案应当同批注销');
}

// —— 用例 2：sidebarRight 缺席时点击不抛异常 ——
{
  created = [];
  const locale = makeLocale();
  const { registered, disposers } = loadPlugin({ locale, sidebarRight: undefined });
  const injected = registered[0].spec.inject();
  assert.doesNotThrow(() => injected.openAssistant());
  for (const row of disposers) row.dispose();
}

// —— 用例 3：locale 服务缺席时回退到内置中文词典 ——
{
  created = [];
  const { registered, disposers } = loadPlugin({ locale: undefined, sidebarRight: undefined });
  const view = registered[0].Component({ ...registered[0].spec.inject(), wide: true });
  assert.equal(view.children[0].props['aria-label'], '问助理');
  // 组件自己兜底：即使插槽没给 t 也不崩
  const view2 = registered[0].Component({ ...registered[0].spec.inject(), wide: true, t: undefined });
  assert.equal(view2.children[0].props['aria-label'], '问助理');
  for (const row of disposers) row.dispose();
}

// —— 用例 4：插槽传入的 t 优先于内置词典 ——
{
  created = [];
  const locale = makeLocale();
  const { registered, disposers } = loadPlugin({ locale, sidebarRight: undefined });
  const fakeT = (key) => (key === 'open' ? '自定义标题' : '自定义提示');
  const view = registered[0].Component({ ...registered[0].spec.inject(), wide: false, t: fakeT });
  assert.equal(view.children[0].props['aria-label'], '自定义标题');
  assert.equal(view.children[0].props.title, '自定义提示');
  for (const row of disposers) row.dispose();
}

console.log('dsh-ask-assistant 自检通过：4 组用例');
