# LCQ.Space 统一 AI 助手部署说明

## 1. 本轮落地内容

- 全站统一右下角悬浮 AI 按钮与统一 AI 面板
- 首页、`docs/cpp_thread.html`、`docs/interview_guide.html`、`weekly_plans.html` 全部接入同一套前端逻辑
- 服务端统一走 Supabase Edge Function `ai-assistant`
- DeepSeek Key 不再出现在前端源码、浏览器 localStorage 或普通可读 Supabase 表里
- AI 历史统一写入 `ai_learning_logs`，全站只保留最近 10 轮
- Weekly Plans 新增 AI 本周学习进度总结回写区

## 2. 关键文件

- 前端统一入口：`/Volumes/ORICO/github/lcqxidian.github.io/ai_assistant.js`
- Edge Function：`/Volumes/ORICO/github/lcqxidian.github.io/supabase/functions/ai-assistant/index.ts`
- Supabase 函数配置：`/Volumes/ORICO/github/lcqxidian.github.io/supabase/config.toml`
- SQL 迁移：`/Volumes/ORICO/github/lcqxidian.github.io/supabase/migrations/20260328110000_ai_assistant.sql`
- 首页接入：`/Volumes/ORICO/github/lcqxidian.github.io/index.html`
- Weekly Plans 接入：`/Volumes/ORICO/github/lcqxidian.github.io/weekly_plans.html`
- C++ 页接入：`/Volumes/ORICO/github/lcqxidian.github.io/docs/cpp_thread.html`
- 八股页接入：`/Volumes/ORICO/github/lcqxidian.github.io/docs/interview_guide.html`

## 3. 安全原则

- AI 只允许读取公开学习数据
- 明确禁止读取：
  - 私密留言板
  - 爸妈历史留言
  - 隐藏身份数据
  - 管理员专属内容
- 由于当前管理员认证是前端态，不可信，所以不提供“浏览器输入一次后永久安全写云端”的前端保存方案
- 真实 DeepSeek Key 必须只放在 Supabase Edge Function 环境变量里

## 4. 部署步骤

### 4.1 执行 SQL

先在 Supabase SQL Editor 执行：

- `/Volumes/ORICO/github/lcqxidian.github.io/supabase/migrations/20260328110000_ai_assistant.sql`

这一步会创建：

- `ai_learning_logs`
- 最近 10 轮自动裁剪触发器

### 4.2 配置函数环境变量

在项目根目录执行：

```bash
supabase functions secrets set \
DEEPSEEK_API_KEY=<你的_key> \
DEEPSEEK_API_ENDPOINT=https://api.deepseek.com/chat/completions \
DEEPSEEK_MODEL=deepseek-chat \
SUPABASE_SERVICE_ROLE_KEY=<你的_service_role_key>
```

说明：

- `SUPABASE_SERVICE_ROLE_KEY` 用于函数读取公开表和写入 `ai_learning_logs`
- `DEEPSEEK_API_ENDPOINT` 和 `DEEPSEEK_MODEL` 可以不改，默认就是 DeepSeek 官方兼容值

### 4.3 部署 Edge Function

```bash
supabase functions deploy ai-assistant
```

仓库里已经设置：

- `supabase/config.toml`
  - `verify_jwt = false`

原因：

- 统一 AI 入口是面向公开访客的，不能要求用户先登录 Supabase

## 5. 前端验证

部署完成后验证这几项：

1. 首页右下角出现统一 `AI` 按钮
2. `docs/cpp_thread.html` 打开 AI 时，面板里能看到当前章节上下文
3. `docs/interview_guide.html` 进入章节后，默认带当前题目上下文，且有“模拟面试官追问”快捷动作
4. `weekly_plans.html` 的“通过统一 AI 拆解每日计划”和“AI 总结本周进度”都走统一面板
5. `ai_learning_logs` 表里始终最多保留 10 轮
6. 首页管理员可见“AI 服务配置”按钮，能看到服务端状态与部署说明

## 6. Weekly Plans 回写说明

- 普通访客可以使用统一 AI 提问
- 但只有管理员角色可以把 AI 拆解结果或 AI 总结回写到 Weekly Plans 并同步到 Supabase
- 这和现有 Weekly Plans 的编辑权限保持一致

## 7. 当前已知边界

- 当前运行环境里没有 `node` / `deno`，所以这一轮没法做命令级 JS/TS 语法检查
- 本轮没有实现服务端限流；如果后续公开流量增大，建议在 Edge Function 前补限流或验证码策略
- AI 历史目前是全站共享最近 10 轮，不区分访客身份
