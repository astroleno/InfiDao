# Search Frozen Holdout v1

Decision: **blocked**

## Category Thresholds

- In-domain: 0/24 (requires 19)
- OOD: 6/6 (requires 6)

## Audit Identity

- Generated at: 2026-08-08T09:20:49.944Z
- Frozen search commit: 81c6365766a7cf8c578cef6b060c5e43345f0d35
- Protocol content commit: 71fa97e7da563abc1d3365292132d36a75e6682b
- Protocol rules SHA-256: bf0ec2ae2353cadba91488eb6359a77c78acf3d0ca1122154871c930ee2098d0
- Evaluation harness commit: 3e9eb8385ec2779708f0bbfe5afa41052a7f9f6b
- Evaluated commit: dc2944974ccf4a837a7894e12b073427d1d58cf0
- Fixture commit: dc2944974ccf4a837a7894e12b073427d1d58cf0
- Fixture blob: 5fd8875da5842770710ceabd40b372440a65669b
- Fixture SHA-256: da6827eb453bd65fb07bba04cfff5fd34d64a8184cdac7dbcf5cd2507c4b37df
- Fixture author: aitoshuu
- Fixture authored at: 2026-08-08T17:08:55+08:00
- Independence attestation: no-alias-tuning;no-current-review;no-evaluator-implementation;no-system-top3-inspection
- Graph artifact signature: sha256:475107bebaad8544cde442d6908ec6ea847e63f22571dab2f844ba703d8452b3
- Graph file SHA-256: f9f213d19019b75e36fcc653176ab297ebedbb3336eb198a2aab7f5ed22531b3
- Embeddings file SHA-256: e6518fa9a221473a72ba4fda17dc838ed98443190788778ef396c0b4199ad3ee
- Corpus manifest SHA-256: e0fb16868d57f3d338375676b54829140daff06388fca77c9b5d91ce665ce56a
- Six Classics corpus SHA-256: 46eba6e46169a1ad701ad8c9ed3b4108b0fa184b77d1893e77bcac4572d9ab37
- Guji core corpus SHA-256: 596df3e835e2ba53971ffa303bfe480ebe808f6692533073be8d460ebd2ed431
- Parameters: topK=5, threshold=0.25

## Failures

- #1 (in-domain) 每天复盘自己是否把承诺和职责都做到位: expected sourceTop3: 论语, got 0 result(s) with no Top 3 IDs
- #2 (in-domain) 和同事合作时怎样建立长期可信赖的口碑: expected sourceTop3: 论语, got 0 result(s) with no Top 3 IDs
- #3 (in-domain) 孩子的家庭教育先培养礼貌还是先堆知识: expected sourceTop3: 论语, got 0 result(s) with no Top 3 IDs
- #4 (in-domain) 公共部门用预算时怎样兼顾节约与体恤民众: expected sourceTop3: 论语, got 0 result(s) with no Top 3 IDs
- #5 (in-domain) 个人成长规划为何要先修炼自己再经营家庭: expected sourceTop3: 大学, got 0 result(s) with no Top 3 IDs
- #6 (in-domain) 开始复杂项目前如何明确止点让心思安定: expected sourceTop3: 大学, got 0 result(s) with no Top 3 IDs
- #7 (in-domain) 冲突谈判中怎样让喜怒表达都不过界: expected sourceTop3: 中庸, got 0 result(s) with no Top 3 IDs
- #8 (in-domain) 独处无人看见时怎样守住自己的原则: expected sourceTop3: 中庸, got 0 result(s) with no Top 3 IDs
- #9 (in-domain) 做公共决策时只追逐经济收益会带来什么后果: expected sourceTop3: 孟子, got 0 result(s) with no Top 3 IDs
- #10 (in-domain) 灾荒年份怎样安排农时和粮食才能让百姓无憾: expected sourceTop3: 孟子, got 0 result(s) with no Top 3 IDs
- #11 (in-domain) 只比别人少犯一点错也值得骄傲吗: expected sourceTop3: 孟子, got 0 result(s) with no Top 3 IDs
- #12 (in-domain) 远距离恋爱让人夜里翻来覆去想念该读什么诗: expected sourceTop3: 诗经, got 0 result(s) with no Top 3 IDs
- #13 (in-domain) 战乱中与伴侣久别的思念如何用古诗表达: expected sourceTop3: 诗经, got 0 result(s) with no Top 3 IDs
- #14 (in-domain) 怎样选拔德才兼备又出身寒微的公共人才: expected sourceTop3: 尚书, got 0 result(s) with no Top 3 IDs
- #15 (in-domain) 政府如何按季节规划农业和公共事务: expected sourceTop3: 尚书, got 0 result(s) with no Top 3 IDs
- #16 (in-domain) 面对低谷时应该积蓄力量等待时机还是贸然出手: expected sourceTop3: 周易, got 0 result(s) with no Top 3 IDs
- #17 (in-domain) 持续自我精进不因阶段性成功停下来: expected sourceTop3: 周易, got 0 result(s) with no Top 3 IDs
- #18 (in-domain) 在职场礼仪里如何尊重他人又不逾越分寸: expected sourceTop3: 礼记, got 5 result(s) with rysxguji-zhongyong-1-2, rysxguji-zhongyong-1-4, zhongyong-4-1
- #19 (in-domain) 面对财富和风险怎样守住底线不苟且: expected sourceTop3: 礼记, got 0 result(s) with no Top 3 IDs
- #20 (in-domain) 成年礼策划需要哪些迎宾和加冠步骤: expected sourceTop3: 仪礼, got 0 result(s) with no Top 3 IDs
- #21 (in-domain) 大型组织如何分设岗位并用制度协调各部门: expected sourceTop3: 周礼, got 0 result(s) with no Top 3 IDs
- #22 (in-domain) 家族权力失衡时为何要尽早处理隐患: expected sourceTop3: 春秋左传, got 0 result(s) with no Top 3 IDs
- #23 (in-domain) 团队遇到困难时如何发现人才并让其承担关键任务: expected sourceTop3: 墨子, got 0 result(s) with no Top 3 IDs
- #24 (in-domain) 长期学习如何靠小步积累而不是三分钟热度: expected sourceTop3: 荀子, got 0 result(s) with no Top 3 IDs
