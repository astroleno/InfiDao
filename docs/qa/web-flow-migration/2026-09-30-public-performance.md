# 公网加载性能抽查

测试地址：https://aitoshuu.me/infidao

本轮只做测量和定位，未更改应用代码或线上配置。公网应用、Nginx 与 Redis active，Docker inactive。应用内存约 124 MiB，机器可用内存约 1000 MiB，应用自动重启计数为 0；服务器回环请求 HTML 三次耗时为 4–8 ms。这些是低负载瞬时值，不能代替并发容量测试。

## 浏览器实测

使用 Chromium、390 × 844 CSS 像素、DPR 3，无网络或 CPU 限速。保留既有阅读和浏览器数据，只切换资源缓存，不能将该结果称为新访客全流程或 iPhone 真机性能。使用临时页面探针记录经典画布向默认 framebuffer 的首次绘制；探针没有写入应用。

| 指标 | 禁用资源缓存 | 缓存可用后刷新 |
| --- | ---: | ---: |
| HTML 首字节 | 1191 ms | 345 ms |
| 首次内容绘制 | 1764 ms | 932 ms |
| load 事件 | 2773 ms | 1597 ms |
| 经轮首次绘制 | 6551 ms | 2068 ms |

原始记录：`output/perf-2026-09-30/browser-loading.json`。样本很少，且之前一次资源下载明显更慢：第二个字体分片到导航后约 21.5 秒才完成。因此 6.6 秒不是稳定上限，也不是 P95。

另一个独立的真实 HTTPS 内容请求，从发出 `/api/flow` 起约 1117 ms 收到 `head`，4454 ms 收到 `frame` 与 `done`。该耗时不包含浏览器脚本下载和字体准备，不能当作页面首屏时间。

## 已定位的优化点

1. **版本化脚本缓存存在冲突。** `/_next/static/` 返回 `public, max-age=31536000, immutable, no-cache`。浏览器缓存可用时，脚本和样式仍产生约 0.5–0.65 秒的重新验证请求。`deploy/nginx/infidao-locations.inc` 对整个 `/_next/` 设置了 `no-cache`；应为 `/_next/static/` 单独保留不可变缓存，HTML 和动态路由继续各自的策略。[MDN Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control)、[Next.js 15 自托管](https://nextjs.org/docs/15/app/guides/self-hosting)。
2. **字体清单开始较晚且分片串行。** 冷资源样本在 2823 ms 才开始字体清单请求，清单耗时 1960 ms；两个所需分片分别在 4813 ms 和 5828 ms 开始，耗时 1004 ms 和 578 ms。代码 `src/lib/flow-browser/fonts.ts` 在循环中逐个等待下载与注册。可提前取得版本清单，有限并行下载所需分片，保留 SHA-256 校验、同源回退、去重和字体一致性。
3. **首屏脚本和样式仍有减重空间。** 此次浏览器实际下载的 JS/CSS 压缩正文约 547 KB；字体模块直接引入 base64 字体。应核对字体与解析器的首屏依赖，将可独立缓存或延后执行的部分拆出，并保留首次失败时的本地精选能力。最长已记录主线程任务约 347 ms；尚未进行持续帧率或耗电测量。

优先级为缓存配置、字体请求安排，再评估首屏包拆分。不能据此承诺优化后的具体秒数；每项实施后应以同样条件复测。实际 iPhone Safari、微信内置浏览器、弱网及多用户负载仍未验收。
