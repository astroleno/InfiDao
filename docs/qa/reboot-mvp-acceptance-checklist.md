# Reboot MVP Acceptance Checklist

Scope: MVP 主路径闭环 / Phase 5 interaction polish.

Canonical path:

`query -> search -> result -> annotate -> links -> explore -> back -> select new result reset -> leaf state`

## 主路径验收

- [ ] 输入现代问题后，`/api/search` 返回 3-5 条合理结果，页面展示稳定结果列表。
- [ ] 点击搜索结果的“进入注我”后，右侧面板展示 `passageId / passageText / sixToMe / meToSix / links`。
- [ ] 点击延伸入口后进入下一层探索，`WikiPanel` 层级增加并显示“返回上一层”。
- [ ] 点击“返回上一层”后回到前一层注释，当前段落与探索路径同步更新。
- [ ] 在第二层或更深层点击新的搜索结果时，旧探索路径立即清空，新结果成功后从第 1 层重新开始。
- [ ] `links: []` 时展示“此处暂无后续探索”，并提示可以返回上一层或重新选择结果。

## Phase 5 验收项

- [ ] 移动端可访问性：搜索入口、结果按钮、注释 tabs、延伸详情按钮、返回上一层按钮都可通过键盘或辅助技术识别。
- [ ] 视觉一致性：搜索结果、探索路径、注释面板都使用当前暗色 `ritual-shell` 视觉语言，不混入旧白底知识图谱壳。
- [ ] 未接线控件：MVP 主路径不展示排序、分享、收藏、知识图谱入口、加载更多、未实现 provider 或调试说明。
- [ ] 交互状态：搜索 loading、注释 loading、API error、空结果、叶子节点都有明确 UI 状态。
- [ ] 文案质量：页面不暴露 `JSON`、`SSE`、`/api/annotate` 等实现细节。

## 验收命令

- [ ] `npm run generate-search-artifacts`
- [ ] `npm run type-check`
- [ ] `npm run lint`
- [ ] `npm run test -- --runInBand`
- [ ] `npm run smoke:release` against a production build or deployed URL.
- [ ] Complete `docs/qa/reboot-mvp-release-readiness.md`.

## HTTP Smoke

- [ ] `GET /api/health` returns `200`, `success: true`, and `data.status: "ok"`.
- [ ] `POST /api/search` returns `200`, `success: true`, and non-empty `data` for `如何面对困境`.
- [ ] `POST /api/annotate` returns `200`, `success: true`, and `links` for `lunyu-1-8`.
- [ ] In dev/test, `GET /api/internal/annotation-telemetry` returns `200` and redacted annotation runtime status.
- [ ] With canonical annotation env (`LLM_MODEL_PRIMARY/SECONDARY`, `LLM_BASE_URL_*`, `LLM_API_KEY_*`), telemetry `llm.warnings` is empty.
- [ ] With legacy annotation env aliases, telemetry reports migration warnings and never returns API keys.

## Browser Smoke

- [ ] Desktop viewport: search, annotation, linked exploration, back, new result reset all complete without layout overlap.
- [ ] Mobile viewport: first screen remains usable, search controls fit, result text does not overflow, annotation panel appears below results without hiding controls.
