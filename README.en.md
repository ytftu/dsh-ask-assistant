# dsh-ask-assistant

An **"Ask Assistant" button** for [DeepSeek Harness](https://github.com/deepseek-ai) (DSH) desktop: one click opens DeepSeek web chat in the sidebar's built-in browser. Great for quick questions that should not start a DSH session — no session tokens burned, no workspace context polluted.

> Screenshot placeholder: capture the sidebar footer in both expanded and collapsed states after installing, save it as `docs/images/sidebar-button.png`, and uncomment the line below.
>
> <!-- ![Ask Assistant button at the sidebar footer](docs/images/sidebar-button.png) -->

## Features

- **Official slot, no asar patching.** The button mounts into the official `sidebar.footer.action` slot, sharing a row with the settings gear. Expanded and collapsed layouts are handled by DSH itself.
- **No hashed class names.** No dependence on CSS-Modules selectors like `._2H3hWW_newSession`, so DSH upgrades will not break it. No `MutationObserver` DOM injection either.
- **Reuses the built-in browser.** Clicking calls the official `sidebarRight.openTab('browser', …)` API, which opens `https://chat.deepseek.com` in a sidebar browser tab. Session/partition handling stays inside DSH.
- **Configurable URL.** Change `ASSISTANT_URL` at the top of `lib/client.js`.
- **Zero dependencies.** The host half is an empty plugin shell; the client half only requires `react` and `@deepseek-ai/dsh-client-ui-primitives`, both shipped with the DSH frontend.

## Install

### Option 1: local link (recommended while developing)

```powershell
# 1. Put the package anywhere, e.g. C:\Users\<you>\.dsh\plugins\dsh-ask-assistant

# 2. Register it as a dependency in the DSH profile's package.json (forward slashes in the path)
#    "dsh-ask-assistant": "link:C:/Users/<you>/.dsh/plugins/dsh-ask-assistant"

# 3. Append the package name to dsh.profile.bundles in the same package.json
#    "dsh-ask-assistant"

# 4. Provide the node_modules link (either one)
#    a) pnpm install      — simplest on a clean profile
#    b) manual junction   — when a pnpm supply-chain policy blocks install
New-Item -ItemType Junction `
  -Path   "C:\Users\<you>\.dsh\profiles\desktop\node_modules\dsh-ask-assistant" `
  -Target "C:\Users\<you>\.dsh\plugins\dsh-ask-assistant"

# 5. Fully quit DSH and start it again
```

### Option 2: npm (after publishing)

```powershell
cd C:\Users\<you>\.dsh\profiles\desktop
pnpm add dsh-ask-assistant
```

Then add `dsh-ask-assistant` to `dsh.profile.bundles` and restart DSH.

## Mounting: bundle or patch?

The package ships both channels. **Pick one — using both yields two buttons.**

- **Bundle channel (recommended):** add the package name to `dsh.profile.bundles`; DSH reads `dsh.bundle.patch` from `package.json` and loads the `insert` entry inside the package.
- **Patch channel:** write it yourself at the end of the profile's `cordis.patch.yml`:

  ```yaml
  - insert:
      - id: ask-assistant
        name: 'dsh-ask-assistant'
  ```

  ⚠️ Use the **package name**, never a relative path such as `./cordis.patch.yml`: patch resolution is based in the package's own directory and cannot walk up to the profile's `node_modules`, so loading fails.

## Uninstall

1. Remove `dsh-ask-assistant` from `dsh.profile.bundles` (and drop the `insert` block if you used the patch channel);
2. Delete the `node_modules/dsh-ask-assistant` link and its dependency line;
3. Restart DSH.

The plugin writes no configuration files, so nothing is left behind except a missing button.

## Development

```
dsh-ask-assistant/
├── package.json          # dsh.bundle.patch → cordis.patch.yml; dsh.client → browser half
├── cordis.patch.yml      # bundle layer: inserts the ask-assistant plugin entry
├── lib/
│   ├── index.js          # host half (empty shell: name / inject / apply)
│   └── client.js         # browser half: registers the sidebar.footer.action component
└── test/
    └── test_plugin.mjs   # offline self-check: fake ModuleLoader + ctx + React
```

Run the self-check without installing anything:

```powershell
node test/test_plugin.mjs
# dsh-ask-assistant 自检通过：4 组用例
```

### The important part of the client half

```js
ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
  name: 'sidebar.footer.action',
  id: 'ask-assistant',              // distinguishes plugins inside one slot
  locale: 'askAssistant',           // translation namespace
  inject: () => ({ openAssistant }) // props handed to the component
}, AskAssistantButton));
```

The component signature is `({ wide, t, ...injectedProps })`:

- `wide` comes from the slot (`false` while the sidebar is collapsed) and selects a 14px or 16px icon;
- `t` is bound to your `locale` namespace via `locale.bind(ns)` — it is **not** `locale.t(key)`;
- strings are registered with `ctx.get('locale').register('askAssistant', { zh: {...}, en: {...} })` and disposed with the plugin's `ctx.effect`.

### Applying changes

The browser half is bundled by the DSH frontend at startup (driven by `dsh.client` in `package.json`), so **restart the DSH desktop app** after editing `lib/client.js`.

## Compatibility

- Only three public surfaces are used: cordis `ctx.get`, the official `sidebar.footer.action` slot, and the official `sidebarRight` service.
- If `sidebarRight` is missing (e.g. renamed in a future release), the button stays but does nothing — no errors, no side effects.
- Developed and verified against DSH Desktop 2.0.21 (`@deepseek-ai/*` 0.2.1-rc.2).

## Relation to the built-in "Ask Assistant" button

Some DSH builds already ship an "Ask Assistant" entry near "New Session" in the sidebar. This plugin neither overrides nor replaces it; it adds the same capability to the sidebar footer so the entry is still one click away when the sidebar is collapsed or the session list pushes the top button out of view.

If your DSH build already gives you a satisfying entry point, you do not need this plugin.

## License

[MIT](LICENSE)
