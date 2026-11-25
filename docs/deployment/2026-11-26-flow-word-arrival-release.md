# 2026-11-26 点词到达与已核验联系复用发布

腾讯上海源站在 01:29:45（UTC+8）启动 `infidao-42d12afceb1f46a1`，提交为 `feb1c803f314ed929c1ee88f48e6e61b5f4b4f22`。01:31 完成两个公网域的验证。发布切换只重启 `infidao-web`。Redis 与手写服务继续使用原进程，两份正式环境文件的完整性检查通过。 [aitoshuu.me](https://aitoshuu.me/InfiDao) · [tongye.me](https://tongye.me/InfiDao)

| 发布项 | 证据 |
| --- | --- |
| 冻结输入 | 固定提交的 820 个文件。源站从该提交恢复后逐文件重算并验证摘要。 |
| 源码内容 SHA-256 | `42d12afceb1f46a1db70b376ed3f01a1c854b3172f7f6cff08acfe9e7c82c245` |
| 冻结源码归档 SHA-256 | `6d5255119bddd333cbb18ce0481e73d4ffbf6463612432f8dba3beb30731a7b4`，31,567,178 字节 |
| CDN 发布清单 SHA-256 | `f8048750ffc469219c84d6e0174b5944a9a6a409569ab1400d854e113d21eb2e` |
| 新版运行文件清单 SHA-256 | `c30652a042c1563af156b0c77119c9b9a3fced1818a61263ad95029514d5ed11`，排除运行缓存 |
| 回滚版本 | `infidao-3a963357ece7288f`，提交 `5934876c36f93b4b7978fb1a8a9d660e71e2e650` |

源站使用 Node 24.22.1 与锁定依赖构建，组装 Next standalone。隔离候选只监听回环地址，使用单独的临时 Redis 与零模型额度。候选验证入口、应用清单、来源目录、指定修订原文、缺失修订与页面的 404、签名会话、静态文件哈希和额度拒绝。候选验证未调用模型。临时 Web 和 Redis 随后停止。

公开 CDN 的新前缀发布一份清单及 22 个字体对象。清单与冻结包逐字节一致。22 个对象的内容 SHA-256、字节数、MIME、跨域与不可变缓存头全部通过，两域入口均引用新版字体清单。 [CDN 发布清单](https://assets.aitoshuu.me/releases/aitoshuu-me/infidao-42d12afceb1f46a1/manifests/release-manifest.json)

切换后，两域的 `/InfiDao` 均返回各自的 canonical 和同一应用发布标识。网页引用的 11 个 JS/CSS 文件与源站当前进程工作目录里的文件逐字节一致，切换前页面引用的 11 个文件在两域也均保持可用。两域均通过来源目录、原文、签名会话与 404 检查。逐项哈希及复算口径已留档。 [应用清单](https://aitoshuu.me/flow-releases/infidao-42d12afceb1f46a1.json) · [验收证据](../qa/evidence/2026-11-26-flow-word-arrival-release.json)

切换前的真实运行版本由活动进程的工作目录、该目录的应用清单，以及回环与公网的 11 个 JS/CSS 指纹共同确定。该进程自 11 月 20 日 19:17:00 起运行，路由脚本与此前冷点击基线留档的脚本及 SHA-256 一致。当时 HTML 引用的 `infidao-9a72686549eafcbd` 是沿用的字体发布前缀，运行应用的版本为 `infidao-3a963357ece7288f`。

新版目录的 `rollback-target.txt` 指向保留的旧应用目录。本次无需执行回滚。发布验收覆盖部署和无模型接口，公网点词性能与关联质量另行实测。iPhone 真机待验。
