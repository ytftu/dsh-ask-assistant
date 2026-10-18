/**
 * dsh-ask-assistant —— 浏览器半边。
 *
 * 在侧边栏底部动作区（官方插槽 sidebar.footer.action，与「设置」齿轮同一行）
 * 放一个「问助理」图标按钮。点它用右侧栏的内置浏览器标签页打开 DeepSeek 网页版
 * 对话（默认 https://chat.deepseek.com），随手问的小问题不消耗 DSH 会话 token。
 *
 * 为什么用官方插槽而不是往 DOM 里硬插按钮：
 * - 插槽渲染出来的位置由 DSH 自己排版，侧边栏收起（rail）与展开两种状态都天然正确；
 * - 不依赖 CSS Modules 的哈希类名，DSH 升级换 class 名也不会失效；
 * - 不用 MutationObserver 反复往 DOM 里塞节点，也不需要清理已插入的残留。
 *
 * 依赖的公开面：cordis 服务的取用（ctx.get）+ 若干官方插槽/服务名
 * （sidebar.footer.action、sidebarRight、locale）。这些都在 DSH 官方客户端插件里注册，
 * 见 @deepseek-ai/dsh-client-ui-sidebar、@deepseek-ai/dsh-client-ui-sidebar-right、
 * @deepseek-ai/dsh-client-locale。
 */
window.__ModuleLoader__.load({
  id: 'dsh-ask-assistant',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    var react = require('react');
    var primitives = require('@deepseek-ai/dsh-client-ui-primitives');

    /** 右侧栏标签页里打开的地址（想换成别的问答站点改这里）。 */
    var ASSISTANT_URL = 'https://chat.deepseek.com';
    /** 文案命名空间，同时用作 locale.register 的命名空间。 */
    var NS = 'askAssistant';
    /** 按钮的唯一样式名：侧边栏用的也是同一套作用域。 */
    var CSS_CLASS = 'dskaa-button';
    /**
     * 底栏容器标记属性。官方底栏布局里「底部动作区」在收起状态下不会隐藏，
     * 但按钮是直接进 flex 容器的，所以给它一个钩子把容器也一起摆正。
     */
    var PANEL_ATTR = 'data-dsh-ask-assistant-footer';

    /** 文案：跟随宿主语言；宿主 locale 服务缺席时按浏览器语言从这里回退。 */
    var DICTS = {
      zh: {
        open: '问助理',
        hint: '用内置浏览器打开 DeepSeek 网页版，不消耗本会话 token'
      },
      en: {
        open: 'Ask Assistant',
        hint: 'Open DeepSeek web chat in the built-in browser'
      }
    };

    /** 内置词典回退：宿主 locale 服务不可用时按浏览器语言选一份。 */
    function fallbackTranslate(key) {
      var lang = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'zh';
      var table = lang.toLowerCase().indexOf('zh') === 0 ? DICTS.zh : DICTS.en;
      return table[key] || DICTS.zh[key] || key;
    }

    /**
     * 取插槽要用的翻译函数。
     * 官方 locale 服务的方法签名是 bind(ns) / translate(ns, key, params)，
     * 没有 t(key)：所以这里拿命名空间绑一个 t(key)，取不到就回退内置词典。
     */
    function makeTranslator(locale) {
      if (locale === undefined || locale === null) return fallbackTranslate;
      if (typeof locale.bind === 'function') {
        try {
          return locale.bind(NS);
        } catch (err) {
          return fallbackTranslate;
        }
      }
      return fallbackTranslate;
    }

    /** 注入样式（幂等：每个页面只注入一次）。 */
    function ensureCss() {
      if (typeof document === 'undefined' || document === null) return;
      if (document.querySelector('style[data-dsh-ask-assistant-css]') !== null) return;
      var tag = document.createElement('style');
      tag.setAttribute('data-dsh-ask-assistant-css', '1');
      // 先挂占位再填内容：重复 apply 时能立刻看到标记，不会注入第二份
      document.head.appendChild(tag);
      tag.textContent = [
        // 与官方侧边栏底部图标按钮同尺寸，保证和「设置」齿轮那一行对齐
        '.' + CSS_CLASS + '{box-sizing:border-box;width:28px;height:28px;flex:none;display:flex;justify-content:center;align-items:center;padding:0;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-family:inherit;transition:background .15s var(--ds-ease-in-out),color .15s var(--ds-ease-in-out)}',
        '.' + CSS_CLASS + ':hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
        '.' + CSS_CLASS + ':focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}',
        // 图标块级显示，避免 svg 底部基线留出空隙把按钮撑高
        '.' + CSS_CLASS + '>svg{display:block}',
        // 底栏容器：默认左对齐、与上方列表留 8px 间距
        '[' + PANEL_ATTR + ']{display:flex;justify-content:flex-start;align-items:center;padding:0 2px 8px}',
        '[' + PANEL_ATTR + ':empty]{display:none}'
      ].join('');
    }

    /** 官方同款的 16px 地球仪图标（描边用 currentColor，自动跟随主题）。 */
    function iconElement(size) {
      return react.createElement('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg',
        strokeWidth: 1,
        'aria-hidden': true
      },
        react.createElement('path', {
          d: 'M7.99986 14.0887C11.3626 14.0887 14.0886 11.3627 14.0886 7.99998C14.0886 4.63727 11.3626 1.91125 7.99986 1.91125C4.63715 1.91125 1.91113 4.63727 1.91113 7.99998C1.91113 11.3627 4.63715 14.0887 7.99986 14.0887Z',
          stroke: 'currentColor'
        }),
        react.createElement('path', { d: 'M2.34619 8H13.6538', stroke: 'currentColor', strokeLinecap: 'square' }),
        react.createElement('path', {
          d: 'M7.99976 14.0889C9.23509 14.0889 10.1743 11.3629 10.1743 8.00006C10.1743 4.63739 9.23509 1.91138 7.99976 1.91138',
          stroke: 'currentColor'
        }),
        react.createElement('path', {
          d: 'M7.99973 14.0889C6.76445 14.0889 5.8252 11.3629 5.8252 8.00006C5.8252 4.63739 6.76445 1.91138 7.99973 1.91138',
          stroke: 'currentColor'
        })
      );
    }

    /** 图标组件：尺寸沿用官方「展开态 14px / 收起态 16px」的习惯。 */
    function GlobeIcon(props) {
      var size = props.wide ? 14 : 16;
      // 宿主 primitives 里已有同名图标就直接用，省得自己维护路径
      var Official = primitives === undefined || primitives === null
        ? undefined
        : props.wide ? primitives.IconGlobeOutlineMedium : primitives.IconGlobeOutlineRegular;
      if (typeof Official === 'function') return react.createElement(Official, { size: size });
      return iconElement(size);
    }

    /**
     * 「问助理」按钮。props 来自插槽：wide 由侧边栏注入（收起态为 false），
     * t 用 locale 命名空间绑定，openAssistant 来自本插件 apply 里的 inject。
     * 外壳 div 自己带定位标记，不依赖插槽容器的类名。
     */
    function AskAssistantButton(props) {
      var t = typeof props.t === 'function' ? props.t : fallbackTranslate;
      var label = t('open');
      return react.createElement('div', { className: 'dsk-aa-footer' },
        react.createElement('button', {
          type: 'button',
          className: CSS_CLASS,
          'aria-label': label,
          title: t('hint'),
          onClick: props.openAssistant
        }, react.createElement(GlobeIcon, { wide: props.wide }))
      );
    }

    /**
     * 给底栏容器打标记：按钮外壳的父节点就是插槽渲染容器。
     * MutationObserver 只在挂载/卸载时触发几次，开销可以忽略。
     */
    function markFooterPanel(root) {
      var retag = function () {
        var panels = root.querySelectorAll('[data-dsh-sidebar-footer-panel], [' + PANEL_ATTR + ']');
        for (var i = 0; i < panels.length; i += 1) panels[i].removeAttribute(PANEL_ATTR);
        var shells = root.querySelectorAll('.dsk-aa-footer');
        for (var j = 0; j < shells.length; j += 1) {
          var parent = shells[j].parentElement;
          if (parent !== null) parent.setAttribute(PANEL_ATTR, '');
        }
      };
      retag();
      if (typeof MutationObserver !== 'function') return null;
      var observer = new MutationObserver(retag);
      observer.observe(root, { childList: true, subtree: true });
      return observer;
    }

    function apply(ctx) {
      if (typeof document === 'undefined' || document === null) return;
      ensureCss();

      // 文案注册给宿主 locale；宿主没有 locale 服务时退回内置词典，功能不受影响
      var locale = ctx.get('locale');
      if (locale !== undefined && locale !== null && typeof locale.register === 'function') {
        ctx.effect(() => locale.register(NS, DICTS), 'ask-assistant: 文案词典');
      }

      // 打开右侧栏的内置浏览器标签页；sidebarRight 服务缺席时静默放弃
      var openAssistant = function () {
        var rightbar = ctx.get('sidebarRight');
        if (rightbar === undefined || rightbar === null || typeof rightbar.openTab !== 'function') return;
        rightbar.openTab('browser', { params: { url: ASSISTANT_URL } });
      };

      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        id: 'ask-assistant',
        locale: NS,
        inject: () => ({ openAssistant: openAssistant })
      }, AskAssistantButton));

      ctx.effect(() => {
        var observer = markFooterPanel(document.body);
        return () => {
          if (observer !== null) observer.disconnect();
          var panels = document.querySelectorAll('[' + PANEL_ATTR + ']');
          for (var i = 0; i < panels.length; i += 1) panels[i].removeAttribute(PANEL_ATTR);
        };
      }, 'ask-assistant: 底栏容器标记');
    }

    exports.apply = apply;
    /** locale 由插槽的 locale 命名空间提供，其余服务都是可选降级，所以硬依赖为空。 */
    exports.inject = [];
    return module.exports;
  }
});
