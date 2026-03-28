# 私密 AI 部署说明

## 1. 本轮落地内容

- 私密留言板改为走服务端口令校验与短时访问 token
- 私密留言板消息读写改为走 Edge Function `secret-companion`
- 新增私密陪伴 AI，支持在留言输入框里用 `@小宝` 唤起、`@关闭` 关闭
- 新增 `secret_ai_memories` 表，保存私密关系上下文的滚动记忆摘要
- 私密 AI 使用独立的服务端模型密钥，不进入前端源码

## 2. 关键文件

- 需求文档：`/Volumes/ORICO/github/lcqxidian.github.io/私密ai需求文档.md`
- 提示词文档：`/Volumes/ORICO/github/lcqxidian.github.io/私密ai提示词.md`
- 私密留言板页面：`/Volumes/ORICO/github/lcqxidian.github.io/secret_board.html`
- Edge Function：`/Volumes/ORICO/github/lcqxidian.github.io/supabase/functions/secret-companion/index.ts`
- 函数配置：`/Volumes/ORICO/github/lcqxidian.github.io/supabase/config.toml`
- SQL 迁移：`/Volumes/ORICO/github/lcqxidian.github.io/supabase/migrations/20260328160000_secret_board_ai.sql`

## 3. 安全说明

- 私密留言板口令不再写在前端页面里
- 私密 AI 模型 key 不允许写在前端源码或普通数据表中
- 私密留言与私密 AI 记忆都改为服务端读取
- 这轮仍然是“共享口令 + 服务端 token”模式，不是真正的账号体系，但已经明显强于原来的前端硬编码口令

## 4. 部署步骤

### 4.1 执行 SQL

在 Supabase SQL Editor 执行：

- `/Volumes/ORICO/github/lcqxidian.github.io/supabase/migrations/20260328160000_secret_board_ai.sql`

这一步会：

- 创建或补齐 `secret_messages`
- 创建 `secret_ai_memories`
- 收紧这两张表对 `anon / authenticated` 的直接访问

### 4.2 配置函数环境变量

在项目根目录执行：

```bash
supabase functions secrets set \
SERVICE_ROLE_KEY=<你的_service_role_key> \
SECRET_BOARD_PASSWORD=<你们私密留言板共享口令> \
SECRET_BOARD_TOKEN_SECRET=<一段新的长随机字符串> \
SECRET_COMPANION_API_KEY=<你的私密AI模型key> \
SECRET_COMPANION_API_ENDPOINT=https://api.deepseek.com/chat/completions \
SECRET_COMPANION_MODEL=deepseek-chat
```

说明：

- `SECRET_BOARD_PASSWORD`
  - 私密留言板的共享进入口令
  - 建议直接换成一条新的口令，不要继续沿用旧版前端里出现过的那条隐藏口令
- `SECRET_BOARD_TOKEN_SECRET`
  - 用来签发和校验短时访问 token
  - 建议使用新的随机字符串，不要和口令本身相同
- `SECRET_COMPANION_API_KEY`
  - 这里填你这次要给私密 AI 单独使用的那把 key

### 4.3 部署 Edge Function

```bash
supabase functions deploy secret-companion
```

仓库里已经设置：

- `/Volumes/ORICO/github/lcqxidian.github.io/supabase/config.toml`
  - `functions.secret-companion.verify_jwt = false`

原因：

- 私密留言板当前不是 Supabase 用户体系，而是共享口令 + 服务端 token 模式

## 5. 验证清单

部署完成后验证：

1. 打开 `/secret_board.html` 时，不再能从前端源码直接看到口令
2. 输入共享口令后可以进入私密留言板并正常查看历史
3. 普通留言发送成功
4. 输入 `@小宝` 后，“小宝陪伴中”状态出现
5. 继续发送普通留言后，AI 会自动追加一条 `小宝` 的回复
6. 输入 `@关闭` 后，AI 停止继续参与
7. `secret_ai_memories` 表能看到滚动记忆摘要被更新

## 6. 已知边界

- 当前环境没有 `node` / `deno`，所以这轮无法做命令级运行校验
- 如果线上还保留了旧的 `secret_messages` 公开访问策略，而没有执行 SQL 迁移，那么新的私密安全边界不会完整生效
- 私密 AI 是否真正可用，取决于 `SECRET_COMPANION_API_KEY` 是否已经在服务端配置
