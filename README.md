# InfiDao - 儒释道技能树 + Infinite Wiki

一个融合知识图谱可视化和AI驱动内容生成的学习平台。

## 🚀 快速开始

### 前置要求

- Node.js 18+
- npm 或 pnpm

### 安装

```bash
# 安装依赖
npm install

# 复制环境变量配置
cp .env.example .env

# 编辑 .env 文件，添加你的 Gemini API Key
```

### 开发

```bash
# 启动开发服务器
npm run dev

# 访问 http://localhost:3000
```

### 构建

```bash
# 类型检查
npm run type-check

# 代码检查
npm run lint

# 构建生产版本
npm run build

# 预览生产版本
npm run preview
```

### 测试

```bash
# 单元测试
npm run test:unit

# E2E测试
npm run test:e2e
```

## 📁 项目结构

采用 Feature-Sliced Design (FSD) 架构：

```
src/
├── app/                 # 应用初始化、路由、全局配置
├── pages/               # 页面组件
├── widgets/             # 复合业务组件（技能树、内容面板）
├── features/            # 用户功能（节点点击、推荐、进度）
├── entities/            # 业务实体（Node、Concept、Scripture）
└── shared/              # 共享基础（UI组件、工具、API客户端）
```

## 🏗️ 技术栈

- **框架**: React 19 + TypeScript
- **构建工具**: Vite
- **状态管理**: Zustand + React Query
- **图形可视化**: React Flow + D3.js
- **动画**: Framer Motion
- **AI服务**: Google Gemini API
- **测试**: Vitest + Playwright

## 📖 文档

- [架构设计文档](./ARCHITECTURE.md)
- [架构澄清文档](./ARCHITECTURE_CLARIFICATION.md)

## 🤝 贡献

欢迎贡献！请阅读贡献指南后提交 Pull Request。

## 📄 许可证

MIT License
