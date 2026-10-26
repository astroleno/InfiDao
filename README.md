# InfiDao 六经注我

## 公网部署规则

正式入口：[tongye.me/InfiDao](https://tongye.me/InfiDao) · [aitoshuu.me/InfiDao](https://aitoshuu.me/InfiDao)。

1. **固定分工**：两个主域名的 DNS、HTTPS 证书和公网入口保留在阿里云 `47.103.120.24`；这 9 个项目的应用或静态源站统一在腾讯云上海 `122.51.59.89`。阿里按项目路径反向代理，浏览器保留当前访问域名；不得把访客跳到服务器 IP、`aitoshuu.art` 或另一个主域名。
2. **路径约定**：`/ArtDuo`、`/SonoScope`、`/FamilyTree`、`/Focuence`、`/OutSet`、`/CordIndex`、`/CoScroll`、`/LuBirth`、`/InfiDao` 是唯一正式大小写。纯小写和其他大小混写用 308 在同域归一；只改项目名前缀，保留子路径大小写、编码和完整查询参数。末尾斜杠沿用各项目路由约定；缺失静态资源返回真实 404。
3. **域名与代理**：链接、接口、canonical 和 OG URL（若有）使用当前公网域名。入口覆盖传入的代理头；源站只信任受控网关的原始域名和客户端地址。跨云 HTTPS 校验真实证书与 SNI，不能关闭证书验证。Cookie、浏览器存储和离线缓存继续按域名隔离；流式接口关闭代理缓存与缓冲。
4. **项目范围**：只调整本项目的源站目录、服务和精确路由，保留两个首页、其他项目、DNS、证书续期及安全规则。服务器迁移不改变网站名称、个人网站属性和页面内容。COS/CDN 使用已有不可变版本前缀，保留 MIME、编码、CORS、缓存和音频 Range；密钥、私有环境、数据库、日志及临时传输包不得进入 Git 或公开目录。
5. **发布顺序**：从已确认的源码或线上冻结版本生成产物，记录源码提交、release ID 和 SHA-256；先上传并逐文件核对腾讯候选，验证依赖与健康状态，再原子切换本项目版本链接或网关 include。共享 Nginx 修改前重新读取现网、备份受影响文件，通过 `nginx -t` 后才重载，保留可用回滚版本，不能覆盖并行维护。
6. **验收与交付**：两个域名分别检查正式、小写、大小混写入口、深层页面、查询参数、版本标记、JS/CSS 与项目关键功能，核实最终地址仍在本站，并确认请求实际到达腾讯。邻站和首页必须回归；新功能按本项目测试要求验收。清理本轮测试服务、临时访问凭据及传输包，记录实际未测项；仅将本轮相关文件 commit、push，核对远端提交后交付。

腾讯运行 `/opt/infidao-current/app`，由 `infidao-web`、`infidao-redis`、`infidao-handwriting` 三个 systemd 服务托管；Node `24.22.1` 监听 `127.0.0.1:3109`，Redis 监听 `127.0.0.1:6389`。私有配置在 `/etc/infidao/`，会话、额度及手写状态在 `/var/lib/infidao/`。迁移必须保留会话密钥、Redis 命名空间与记录、手写任务和原有 30 / 60 / 200 日额度，禁止重置或扩大限额。

项目部署细节见[部署记录](docs/deployment/tencent-origin-migration-20261026.md)。旧文档或工具草案若仍把活动源站写成阿里，应按本节腾讯源站架构审阅后使用，不得直接覆盖现网。


InfiDao is a Next.js 15 application for connecting modern questions with
classical Chinese passages. Its active Reboot MVP path is:

```text
query -> search -> result -> annotate -> links -> explore -> back -> select new result reset -> leaf state
```

The public API contract remains:

- `POST /api/search`
- `POST /api/annotate`
- `GET /api/health`

## Current Status

The project is in **quality/release convergence**, not currently signed off as
a Release Candidate. The searchable MVP, deterministic fallback annotation,
and release gates are implemented. Final signoff still requires an independent
frozen holdout, a clean-worktree verification of the integrated release commit,
and current desktop/mobile manual acceptance.

Authoritative release evidence:

- `docs/qa/2026-07-26-quality-convergence-baseline.md`
- `docs/qa/search-quality-methodology.md`
- `docs/qa/reboot-mvp-release-readiness.md`
- `docs/qa/reboot-mvp-acceptance-checklist.md`

## Architecture

- Runtime search is JSON-first: local JSONL passages, committed embeddings, and
  in-memory hybrid retrieval. It does not contact Daizhige at request time.
- The optional search-graph sidecar is fail-open and does not change public
  search-ranking weights.
- Annotation returns one JSON response. When no provider credentials are
  configured, the user still receives deterministic fallback copy.
- Exploration is a stack: following a link adds a level; selecting a new root
  result resets the stack.

## Quick Start

Prerequisite: Node.js 20 (CI uses Node 20). Optional annotation-provider
credentials may be placed in `.env.local`; without them the deterministic
fallback remains available.

```bash
npm ci
npm run generate:release-artifacts
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and try `如何面对困境`.

Install Chromium once before the first local browser run, then execute the E2E
suite. Playwright starts a development server on `127.0.0.1:3100` automatically.

```bash
npx playwright install chromium
npm run test:e2e
```

## Verification

Run the release gates in this order:

```bash
npm run generate:release-artifacts
git diff --exit-code -- data/embeddings.json data/search-graph.json
npm run type-check
npm run lint
npm test -- --runInBand --no-cache
npm test -- --runInBand --no-cache
npm run test:stability
npm run test:stability
npm run test:search-quality
npm run test:e2e
npm run build
```

The quality gate checks the visible golden regression suite and verifies that
the embeddings and graph artifacts reproduce exactly. The known tuned-paraphrase
fixtures are regression evidence, not unseen generalization; the independent
one-shot holdout protocol is in `docs/qa/search-quality-methodology.md`.

After `npm run build`, run the standalone production smoke:

```bash
mkdir -p .next/standalone/data
cp -R data/. .next/standalone/data/
rm -rf .next/standalone/.next/static
mkdir -p .next/standalone/data
cp -R data/. .next/standalone/data/
mkdir -p .next/standalone/.next/static
cp -R .next/static/. .next/standalone/.next/static/
if [ -d public ]; then mkdir -p .next/standalone/public && cp -R public/. .next/standalone/public/; fi
PORT=3001 HOSTNAME=127.0.0.1 node .next/standalone/server.js
SMOKE_BASE_URL=http://127.0.0.1:3001 npm run smoke:release
E2E_BASE_URL=http://127.0.0.1:3001 npm run test:e2e
```

Local E2E runs use the development server by default. The `E2E_BASE_URL` form
above is the explicit manual check for a production standalone server; browser
E2E is intentionally not part of the GitHub Actions workflow.

For canonical annotation telemetry validation, use a fresh development or test
server with credentials; the telemetry route is intentionally unavailable in
production standalone mode. See `docs/qa/reboot-mvp-release-readiness.md` for
the full matrix and the accepted no-credential fallback exception.

## Local Corpus and Artifacts

`guji-core-v1` covers 14 works. The rysxguji acquisition batch contains 11,809
passages with matching provenance records; the combined runtime corpus contains
11,829 passages and embeddings. The optional graph artifact currently has
12,825 nodes and 24,084 edges.

Daizhige is an acquisition-time source only. To rebuild local artifacts after a
corpus change:

```bash
node scripts/rysxguji/build-corpus.mjs
npm run generate:release-artifacts
git diff --exit-code -- data/embeddings.json data/search-graph.json
```

See `data/rysxguji/README.md` and
`docs/rysxguji-local-corpus/IMPLEMENTATION_PLAN.md` for provenance and corpus
constraints.

## Active Commands

| Command                              | Purpose                                                     |
| ------------------------------------ | ----------------------------------------------------------- |
| `npm run dev`                        | Start the local development server.                         |
| `npm run build` / `npm run start`    | Build or run the Next.js production app.                    |
| `npm run generate:release-artifacts` | Regenerate embeddings and the graph sidecar.                |
| `npm run type-check`                 | Type-check app, tests, and active TypeScript scripts.       |
| `npm run lint`                       | Lint `src`, `tests`, and active scripts with zero warnings. |
| `npm test -- --runInBand --no-cache` | Run the full unit and integration suite deterministically.  |
| `npm run test:e2e`                   | Run the desktop and mobile Chromium Reboot MVP path.        |
| `npm run test:stability`             | Run the cold-start-sensitive suites.                        |
| `npm run test:search-quality`        | Check search quality and artifact reproducibility.          |
| `npm run smoke:release`              | Exercise a deployed or standalone production path.          |
| `npm run smoke:telemetry`            | Validate dev/test annotation telemetry.                     |

## Project Layout

```text
app/                 Next.js routes and the MVP page
src/lib/search/      local embedding, lexical, fusion, evidence, graph support
src/lib/annotation/  one-shot annotation runtime and deterministic fallback
tests/               unit, integration, UI, and release-contract checks
scripts/             artifact generation, quality gates, and smoke scripts
data/                committed local corpus, embeddings, and graph artifacts
docs/qa/             release evidence and acceptance records
```

## Contributing

Keep changes within the Reboot MVP architecture: no request-time online corpus
dependency, no public A2A route, and no change to the public API contract
without an explicit product decision. Regenerate artifacts and run the relevant
gates whenever changing corpus or search code.

## License

MIT. See [LICENSE](./LICENSE).
