/**
 * dsh-ask-assistant —— 宿主半边。
 *
 * 本插件没有任何宿主侧逻辑：点按钮打开网页这件事完全在浏览器半边完成。
 * 这里只保留一个最小可加载的 Cordis 插件外壳（name / inject / apply），
 * 让 cordis.patch.yml 里的 insert 条目有东西可插。
 *
 * 界面实现见 lib/client.js，随 package.json 的 dsh.client 声明由 DSH 前端加载。
 */
export const name = 'ask-assistant';

/** 不依赖任何宿主服务。 */
export const inject = [];

export function apply() {}
