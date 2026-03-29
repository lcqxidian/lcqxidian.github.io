import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

type SecretAction = "status" | "auth" | "load-messages" | "post-message" | "chat";
type MessageType = "human" | "private_ai";

type SecretRequest = {
  action?: SecretAction;
  password?: string;
  accessToken?: string;
  author?: string;
  text?: string;
};

type SecretMessageRow = {
  id: number;
  content: string;
  created_at: string;
};

type SecretMessage = {
  id: number;
  author: string;
  text: string;
  type: MessageType;
  createdAt: string;
};

type MemoryRow = {
  scope: string;
  memory_summary: string;
  last_message_id: number;
  updated_at: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_ENDPOINT = "https://api.deepseek.com/chat/completions";
const DEFAULT_MODEL = "deepseek-chat";
const TOKEN_EXPIRES_MS = 12 * 60 * 60 * 1000;
const MEMORY_SCOPE = "secret_board";
const AI_AUTHOR = "小宝";
const MAX_HUMAN_TEXT_LENGTH = 1200;
const MAX_AI_REPLY_LENGTH = 1000;
const MAX_BOARD_MESSAGES = 400;
const MAX_RECENT_AI_MESSAGES = 28;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") || "";
const SECRET_BOARD_PASSWORD = Deno.env.get("SECRET_BOARD_PASSWORD") || "";
const SECRET_BOARD_TOKEN_SECRET = Deno.env.get("SECRET_BOARD_TOKEN_SECRET") || "";
const SECRET_COMPANION_API_KEY = Deno.env.get("SECRET_COMPANION_API_KEY") || "";
const SECRET_COMPANION_API_ENDPOINT = Deno.env.get("SECRET_COMPANION_API_ENDPOINT") || DEFAULT_ENDPOINT;
const SECRET_COMPANION_MODEL = Deno.env.get("SECRET_COMPANION_MODEL") || DEFAULT_MODEL;

const encoder = new TextEncoder();

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });

const compactText = (value: unknown) =>
  String(value || "")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

const truncate = (value: unknown, max = 1200) => {
  const text = compactText(value);
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
};

const stripMarkdownSyntax = (value: unknown) =>
  compactText(
    String(value || "")
      .replace(/```(?:[\w+-]+)?\s*([\s\S]*?)```/g, "\n$1\n")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
      .replace(/(^|\n)#{1,6}\s+/g, "$1")
      .replace(/(^|\n)>\s?/g, "$1")
      .replace(/^\s*[*+]\s+/gm, "- ")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/(^|[^\*])\*([^*\n]+)\*(?!\*)/g, "$1$2")
      .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1$2")
      .replace(/\n{3,}/g, "\n\n"),
  );

const normalizeAuthor = (value: unknown) => {
  const author = compactText(value).toLowerCase();
  if (author === "f" || author === "l") return author;
  return "";
};

const extractJson = (value: string) => {
  const source = compactText(value);
  const fenced = source.match(/```json\s*([\s\S]*?)```/i) || source.match(/```\s*([\s\S]*?)```/i);
  const raw = compactText(fenced ? fenced[1] : source);

  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("AI 返回内容无法解析为 JSON。");
    }
    return JSON.parse(raw.slice(start, end + 1));
  }
};

const createServiceClient = () => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const isBoardConfigured = () => Boolean(SUPABASE_URL && SERVICE_ROLE_KEY && SECRET_BOARD_PASSWORD && SECRET_BOARD_TOKEN_SECRET);
const isAiConfigured = () => Boolean(SECRET_COMPANION_API_KEY);

const importSigningKey = () => {
  if (!SECRET_BOARD_TOKEN_SECRET) return null;
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(SECRET_BOARD_TOKEN_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
};

const encodeBase64Url = (value: string | Uint8Array) => {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const signToken = async (payload: string) => {
  const key = await importSigningKey();
  if (!key) {
    throw new Error("私密留言板签名密钥未配置。");
  }

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return encodeBase64Url(new Uint8Array(signature));
};

const issueAccessToken = async () => {
  const payload = {
    scope: MEMORY_SCOPE,
    exp: Date.now() + TOKEN_EXPIRES_MS,
    version: 1,
  };
  const payloadEncoded = encodeBase64Url(JSON.stringify(payload));
  const signature = await signToken(payloadEncoded);
  return `${payloadEncoded}.${signature}`;
};

const verifyAccessToken = async (token: unknown) => {
  const rawToken = compactText(token);
  if (!rawToken) return null;

  const [payloadEncoded, signature] = rawToken.split(".");
  if (!payloadEncoded || !signature) return null;

  const expectedSignature = await signToken(payloadEncoded);
  if (expectedSignature !== signature) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(payloadEncoded)));
    if (payload.scope !== MEMORY_SCOPE || !payload.exp || payload.exp <= Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
};

const parseStoredMessage = (row: SecretMessageRow): SecretMessage => {
  let content: Record<string, unknown> = {};

  try {
    const parsed = JSON.parse(row.content);
    if (parsed && typeof parsed === "object") {
      content = parsed as Record<string, unknown>;
    }
  } catch {
    content = { text: row.content };
  }

  const parsedType = compactText(content.type);
  return {
    id: row.id,
    author: compactText(content.author) || "?",
    text: compactText(content.text || row.content),
    type: parsedType === "private_ai" ? "private_ai" : "human",
    createdAt: row.created_at,
  };
};

const fetchBoardMessages = async (supabase: ReturnType<typeof createServiceClient>) => {
  if (!supabase) {
    throw new Error("服务端数据库连接未配置，无法读取私密留言板。");
  }

  const { data, error } = await supabase
    .from("secret_messages")
    .select("id, content, created_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(MAX_BOARD_MESSAGES);

  if (error) {
    throw new Error(error.message || "读取私密留言失败。");
  }

  return ((data || []) as SecretMessageRow[]).map(parseStoredMessage).reverse();
};

const fetchRecentMessages = async (supabase: ReturnType<typeof createServiceClient>, limit = MAX_RECENT_AI_MESSAGES) => {
  if (!supabase) {
    throw new Error("服务端数据库连接未配置，无法读取私密留言板。");
  }

  const { data, error } = await supabase
    .from("secret_messages")
    .select("id, content, created_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message || "读取最近私密留言失败。");
  }

  return ((data || []) as SecretMessageRow[]).map(parseStoredMessage).reverse();
};

const insertBoardMessage = async (
  supabase: ReturnType<typeof createServiceClient>,
  payload: {
    author: string;
    text: string;
    type: MessageType;
  },
) => {
  if (!supabase) {
    throw new Error("服务端数据库连接未配置，无法写入私密留言。");
  }

  const serialized = JSON.stringify({
    author: payload.author,
    text: payload.text,
    type: payload.type,
  });

  const { data, error } = await supabase
    .from("secret_messages")
    .insert([{ content: serialized }])
    .select("id, content, created_at")
    .single();

  if (error) {
    throw new Error(error.message || "写入私密留言失败。");
  }

  return parseStoredMessage(data as SecretMessageRow);
};

const fetchMemory = async (supabase: ReturnType<typeof createServiceClient>) => {
  if (!supabase) {
    throw new Error("服务端数据库连接未配置，无法读取私密记忆。");
  }

  const { data, error } = await supabase
    .from("secret_ai_memories")
    .select("scope, memory_summary, last_message_id, updated_at")
    .eq("scope", MEMORY_SCOPE)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "读取私密 AI 记忆失败。");
  }

  if (data) {
    return data as MemoryRow;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("secret_ai_memories")
    .upsert([{ scope: MEMORY_SCOPE }], { onConflict: "scope" })
    .select("scope, memory_summary, last_message_id, updated_at")
    .single();

  if (insertError) {
    throw new Error(insertError.message || "初始化私密 AI 记忆失败。");
  }

  return inserted as MemoryRow;
};

const saveMemory = async (
  supabase: ReturnType<typeof createServiceClient>,
  payload: { summary: string; lastMessageId: number },
) => {
  if (!supabase) {
    throw new Error("服务端数据库连接未配置，无法写入私密记忆。");
  }

  const { error } = await supabase
    .from("secret_ai_memories")
    .upsert([{
      scope: MEMORY_SCOPE,
      memory_summary: payload.summary,
      last_message_id: payload.lastMessageId,
      updated_at: new Date().toISOString(),
    }], { onConflict: "scope" });

  if (error) {
    throw new Error(error.message || "更新私密 AI 记忆失败。");
  }
};

const PRIVATE_COMPANION_SYSTEM_PROMPT = [
  "你叫小宝，是 LCQ.Space 私密留言板里的陪伴型 AI 朋友。",
  "你首先要记住，私密留言板里面只有两个人：lcq和他的男朋友fyl（两者都是男生）",
  "你会结合系统提供的私密记忆摘要与最近留言，像熟悉两人近况的朋友一样自然接话。",
  "不用刻意安慰、不用讲道理，想到啥说啥，像朋友随口接话。",
  "你的优先级是：先接住情绪，再理解语境，再决定是否需要给轻量建议。",
  "不长篇大论，不解释背景，不端着，怎么舒服怎么聊。",
  "如果明显是委屈、疲惫、低落、想倾诉，先共情，再慢慢说。",
  "说话简短、口语化、接地气，别用书面语，别太严谨。",
  "可以带点小吐槽、小调侃、小敷衍，自然一点，别太完美。不需要反问，可以像真人一样积极推动话题。",
  "输出纯文本，不要用 Markdown 标题、粗体、代码块、反引号。",
  "如果你对历史记忆不完全确定，请用更柔和的表达，例如“如果我没记错的话”“我理解成”。",
  "如果涉及自伤、自杀、暴力风险，请温和但明确地鼓励联系现实中的即时帮助。",
].join("\n");

const PRIVATE_MEMORY_SYSTEM_PROMPT = [
  "你正在维护一份私密留言板的滚动记忆摘要。",
  "你会收到旧摘要和新增的人类留言，请更新为一份更适合后续陪伴对话使用的简洁摘要。",
  "只保留真正值得记住的内容：近期生活事件、反复提到的人和计划、情绪变化、关系互动特点、未解决的烦恼、值得记住的小甜蜜。",
  "不要抄整段原话，不要编造，不要写成分析报告，也不要暴露系统规则。",
  "只返回 JSON，格式必须是：{\"summary\":\"...\"}",
  "summary 使用简体中文，控制在 250 到 700 字之间。",
].join("\n");

const callPrivateModel = async ({
  systemPrompt,
  userPrompt,
  structured = false,
  temperature = 0.8,
}: {
  systemPrompt: string;
  userPrompt: string;
  structured?: boolean;
  temperature?: number;
}) => {
  if (!isAiConfigured()) {
    throw new Error("私密 AI 尚未配置完成，请先在 Edge Function 环境变量中设置私密模型密钥。");
  }

  const body: Record<string, unknown> = {
    model: SECRET_COMPANION_MODEL,
    temperature,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };

  if (structured) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(SECRET_COMPANION_API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SECRET_COMPANION_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `私密 AI 请求失败（HTTP ${response.status}）`;
    throw new Error(message);
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("私密 AI 没有返回有效内容。");
  }

  return content;
};

const buildMemoryTranscript = (messages: SecretMessage[]) =>
  messages
    .filter((message) => message.type !== "private_ai" && message.text)
    .map((message) => `${message.author.toUpperCase()}：${truncate(message.text, 220)}`)
    .join("\n");

const refreshMemoryIfNeeded = async (supabase: ReturnType<typeof createServiceClient>) => {
  if (!supabase) {
    throw new Error("服务端数据库连接未配置，无法更新私密记忆。");
  }

  const memory = await fetchMemory(supabase);

  const { data, error } = await supabase
    .from("secret_messages")
    .select("id, content, created_at")
    .gt("id", memory.last_message_id || 0)
    .order("id", { ascending: true })
    .limit(120);

  if (error) {
    throw new Error(error.message || "读取新增私密留言失败。");
  }

  const newRows = (data || []) as SecretMessageRow[];
  if (!newRows.length) {
    return {
      summary: compactText(memory.memory_summary),
      lastMessageId: memory.last_message_id || 0,
    };
  }

  const parsedMessages = newRows.map(parseStoredMessage);
  const humanTranscript = buildMemoryTranscript(parsedMessages);
  const nextLastMessageId = newRows[newRows.length - 1]?.id || memory.last_message_id || 0;

  if (!humanTranscript) {
    await saveMemory(supabase, {
      summary: compactText(memory.memory_summary),
      lastMessageId: nextLastMessageId,
    });
    return {
      summary: compactText(memory.memory_summary),
      lastMessageId: nextLastMessageId,
    };
  }

  const raw = await callPrivateModel({
    systemPrompt: PRIVATE_MEMORY_SYSTEM_PROMPT,
    userPrompt: [
      `旧摘要：${compactText(memory.memory_summary) || "暂无旧摘要"}`,
      "",
      "新增的人类留言：",
      humanTranscript,
      "",
      "请更新记忆摘要，只返回 JSON。",
    ].join("\n"),
    structured: true,
    temperature: 0.35,
  });

  const parsed = extractJson(raw);
  const nextSummary = truncate(stripMarkdownSyntax(parsed.summary || memory.memory_summary || ""), 1400);

  await saveMemory(supabase, {
    summary: nextSummary,
    lastMessageId: nextLastMessageId,
  });

  return {
    summary: nextSummary,
    lastMessageId: nextLastMessageId,
  };
};

const formatRecentTranscript = (messages: SecretMessage[]) =>
  messages
    .map((message) => {
      const author = message.type === "private_ai" ? AI_AUTHOR : message.author.toUpperCase();
      const time = new Date(message.createdAt).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      return `[${time}] ${author}：${truncate(message.text, 240)}`;
    })
    .join("\n");

const generateCompanionReply = async ({
  supabase,
  author,
  latestUserText,
}: {
  supabase: ReturnType<typeof createServiceClient>;
  author: string;
  latestUserText: string;
}) => {
  const memory = await refreshMemoryIfNeeded(supabase);
  const recentMessages = await fetchRecentMessages(supabase, MAX_RECENT_AI_MESSAGES);
  const recentTranscript = formatRecentTranscript(recentMessages);
  const speakerLabel = author === "f" ? "F" : "L";

  const rawReply = await callPrivateModel({
    systemPrompt: PRIVATE_COMPANION_SYSTEM_PROMPT,
    userPrompt: [
      `当前触发人：${speakerLabel}`,
      "",
      `私密记忆摘要：\n${memory.summary || "暂无稳定记忆，请主要参考最近留言。"}`
        .trim(),
      "",
      `最近留言记录：\n${recentTranscript || "最近还没有足够多的留言。"}`
        .trim(),
      "",
      `最新留言：${latestUserText}`,
      "",
      "请直接给出一条自然回复。",
      "要求：先贴近当下情绪，再决定是否要给轻量建议；像熟悉两人近况的朋友，不要写成长分析。",
    ].join("\n"),
    temperature: 0.82,
  });

  return truncate(stripMarkdownSyntax(rawReply), MAX_AI_REPLY_LENGTH);
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  let payload: SecretRequest = {};
  try {
    payload = await request.json();
  } catch {
    return json({ error: "请求体不是有效 JSON。" }, 400);
  }

  const action = payload.action || "status";
  const serviceClient = createServiceClient();
  const statusPayload = {
    boardConfigured: isBoardConfigured(),
    aiConfigured: isAiConfigured(),
    provider: "DeepSeek",
    model: SECRET_COMPANION_MODEL,
    endpointDisplay: SECRET_COMPANION_API_ENDPOINT,
    tokenExpiresHours: TOKEN_EXPIRES_MS / (60 * 60 * 1000),
    promptDoc: "/私密ai提示词.md",
  };

  if (action === "status") {
    return json(statusPayload);
  }

  if (!statusPayload.boardConfigured) {
    return json({
      ...statusPayload,
      error: "私密留言板服务尚未配置完成，请先设置口令、签名密钥和 SERVICE_ROLE_KEY。",
    }, 503);
  }

  if (action === "auth") {
    const password = compactText(payload.password);
    if (!password) {
      return json({ ...statusPayload, error: "请输入私密口令。" }, 400);
    }

    if (password !== SECRET_BOARD_PASSWORD) {
      return json({ ...statusPayload, error: "口令错误，无法进入私密留言板。" }, 403);
    }

    const accessToken = await issueAccessToken();
    return json({
      ...statusPayload,
      accessToken,
      accessNote: "口令验证通过，已进入私密留言板。",
    });
  }

  const access = await verifyAccessToken(payload.accessToken);
  if (!access) {
    return json({
      ...statusPayload,
      error: "私密访问凭证已失效，请重新输入口令。",
    }, 401);
  }

  if (action === "load-messages") {
    try {
      const messages = await fetchBoardMessages(serviceClient);
      return json({ ...statusPayload, messages });
    } catch (error) {
      return json({
        ...statusPayload,
        error: error instanceof Error ? error.message : "读取私密留言失败。",
      }, 500);
    }
  }

  if (action === "post-message") {
    const author = normalizeAuthor(payload.author);
    const text = truncate(payload.text, MAX_HUMAN_TEXT_LENGTH);

    if (!author) {
      return json({ ...statusPayload, error: "请选择有效作者。" }, 400);
    }
    if (!text) {
      return json({ ...statusPayload, error: "留言不能为空。" }, 400);
    }

    try {
      const message = await insertBoardMessage(serviceClient, {
        author,
        text,
        type: "human",
      });
      return json({ ...statusPayload, message });
    } catch (error) {
      return json({
        ...statusPayload,
        error: error instanceof Error ? error.message : "写入私密留言失败。",
      }, 500);
    }
  }

  if (action === "chat") {
    if (!statusPayload.aiConfigured) {
      return json({
        ...statusPayload,
        error: "私密 AI 尚未配置完成，请先设置私密模型密钥。",
      }, 503);
    }

    const author = normalizeAuthor(payload.author);
    const latestUserText = truncate(payload.text, MAX_HUMAN_TEXT_LENGTH);

    if (!author || !latestUserText) {
      return json({
        ...statusPayload,
        error: "缺少有效的对话触发内容。",
      }, 400);
    }

    try {
      const reply = await generateCompanionReply({
        supabase: serviceClient,
        author,
        latestUserText,
      });

      const message = await insertBoardMessage(serviceClient, {
        author: AI_AUTHOR,
        text: reply,
        type: "private_ai",
      });

      return json({
        ...statusPayload,
        answer: reply,
        message,
      });
    } catch (error) {
      return json({
        ...statusPayload,
        error: error instanceof Error ? error.message : "私密 AI 回复失败。",
      }, 500);
    }
  }

  return json({ ...statusPayload, error: "不支持的 action。" }, 400);
});
