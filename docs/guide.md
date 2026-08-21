# 使用指南

## 安装工具

```bash
npm install bun -g
npm install -g @anthropic-ai/claude-code
npm install -g @openai/codex
npm install -g opencode-ai
```

### 安装技能

```bash
npx skills add jimliu/baoyu-skills -y
npx skills add https://github.com/xiangyu-cas/xiaohongshu-ops-skill --skill xiaohongshu-ops
npx skills add https://github.com/kangarooking/cangjie-skill --skill cangjie-skill
npx skills add alchaincyf/nuwa-skill
npx skills add alchaincyf/darwin-skill
npx skills add https://github.com/iamzhihuix/happy-claude-skills --skill wechat-article-writer
npx skills add https://github.com/vercel-labs/agent-browser --skill agent-browser
```

### 根目录下创建
往 `.baoyu-skills/.env` 写入所需的密钥（选配，用的到才配）：

| 提供商 | 环境变量 | 获取地址 |
|--------|---------|---------|
| Google Gemini | `GOOGLE_API_KEY` | [aistudio.google.com/api-keys](https://aistudio.google.com/api-keys) |
| OpenAI | `OPENAI_API_KEY` | platform.openai.com |
| DashScope（通义万象） | `DASHSCOPE_API_KEY` | dashscope.aliyun.com |
| Jimeng（即梦） | `JIMENG_API_KEY` | jimeng.jianying.com |
| Seedream（豆包/火山引擎） | `ARK_API_KEY` | console.volcengine.com |
| Replicate | `REPLICATE_API_TOKEN` | replicate.com |
| OpenRouter | `OPENROUTER_API_KEY` | openrouter.ai |

## 创建符号链接举例
ln -s ../../.agents/skills/xhs-title-writer .claude/skills/xhs-title-writer

## 参考资料
https://www.skills.sh/autoclaw-cc/xiaohongshu-skills/xiaohongshu-skills
https://www.skills.sh/white0dew/xiaohongshuskills/redbookskills
https://www.skills.sh/xiangyu-cas/xiaohongshu-ops-skill/xiaohongshu-ops