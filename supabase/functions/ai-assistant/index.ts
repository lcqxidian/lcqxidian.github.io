import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

type ActionMode = "general" | "weekly_plan" | "weekly_summary" | "interview_followup";
type PageType = "index_home" | "cpp_thread" | "interview_guide" | "weekly_plans";

type HistoryRow = {
  id: number;
  page_type: PageType;
  page_key: string;
  actor_role: string;
  context_scope: string | null;
  context_title: string | null;
  user_question: string;
  ai_answer: string;
  created_at: string;
};

type ChatRequest = {
  action?: "chat" | "history" | "config-status" | "delete-history";
  actionMode?: ActionMode;
  pageType?: string;
  pageKey?: string;
  actorRole?: string;
  question?: string;
  historyId?: number;
  context?: {
    scope?: string;
    title?: string;
    content?: string;
  };
};

type PublicDataset = {
  knowledgeCards: Array<Record<string, unknown>>;
  cppNotes: Array<Record<string, unknown>>;
  interviewTopics: Array<Record<string, unknown>>;
  weeklyPlans: Array<Record<string, unknown>>;
  warnings: string[];
};

type RetrievalSourceType =
  | "page_context"
  | "knowledge_card"
  | "cpp_note"
  | "interview_topic"
  | "weekly_plan";

type RetrievalChunk = {
  id: string;
  sourceKey: string;
  sourceType: RetrievalSourceType;
  pageType: PageType;
  sourceLabel: string;
  title: string;
  text: string;
};

type RankedChunk = RetrievalChunk & {
  score: number;
  termHits: number;
  titleHits: number;
  contextHits: number;
  wholeQuestionMatch: boolean;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-chat";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") || "";
const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY") || "";
const DEEPSEEK_API_ENDPOINT = Deno.env.get("DEEPSEEK_API_ENDPOINT") || DEFAULT_DEEPSEEK_ENDPOINT;
const DEEPSEEK_MODEL = Deno.env.get("DEEPSEEK_MODEL") || DEFAULT_DEEPSEEK_MODEL;
const ALLOWED_PAGE_TYPES = new Set<PageType>(["index_home", "cpp_thread", "interview_guide", "weekly_plans"]);
const ALLOWED_ROLES = new Set(["guest", "friend", "dad", "mom", "admin", "xiaobao"]);
const MANAGE_HISTORY_ROLES = new Set(["admin", "xiaobao"]);
const ACTION_RETRIEVAL_CHUNK_LIMITS: Record<ActionMode, number> = {
  general: 6,
  weekly_plan: 8,
  weekly_summary: 8,
  interview_followup: 6,
};
const SEARCH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "for",
  "from",
  "how",
  "in",
  "is",
  "of",
  "on",
  "or",
  "please",
  "that",
  "the",
  "this",
  "to",
  "what",
  "why",
  "with",
  "一下",
  "一下子",
  "以及",
  "什么",
  "什么是",
  "介绍",
  "你们",
  "告诉我",
  "吗",
  "如何",
  "帮我",
  "怎么",
  "总结",
  "我们",
  "我想",
  "我的",
  "我想问",
  "一下吧",
  "是否",
  "为什么",
  "解释",
  "请问",
  "这个",
  "那个",
  "这次",
  "那种",
]);

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

const truncate = (value: unknown, max = 3200) => {
  const text = compactText(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
};

const normalizePageType = (value: unknown): PageType => {
  const pageType = String(value || "").trim() as PageType;
  return ALLOWED_PAGE_TYPES.has(pageType) ? pageType : "index_home";
};

const normalizeActorRole = (value: unknown) => {
  const role = String(value || "").trim().toLowerCase();
  return ALLOWED_ROLES.has(role) ? role : "guest";
};

const normalizeHistoryId = (value: unknown) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

const normalizeActionMode = (value: unknown): ActionMode => {
  const mode = String(value || "").trim() as ActionMode;
  if (mode === "weekly_plan" || mode === "weekly_summary" || mode === "interview_followup") {
    return mode;
  }
  return "general";
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

const isConfigured = () => Boolean(SUPABASE_URL && SERVICE_ROLE_KEY && DEEPSEEK_API_KEY);

const toBulletLines = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.map((item) => compactText(item)).filter(Boolean);
  }
  return compactText(value)
    .split(/\n+/)
    .map((item) => item.replace(/^[-*•\d.\s]+/, "").trim())
    .filter(Boolean);
};

const uniqueTerms = (terms: string[], max = 24) => {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const term of terms) {
    const normalized = compactText(term).toLowerCase();
    if (!normalized || seen.has(normalized) || SEARCH_STOP_WORDS.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= max) break;
  }

  return result;
};

const splitIntoChunks = (value: unknown, maxLength = 520, overlap = 80) => {
  const source = compactText(value);
  if (!source) return [];

  const splitLongSegment = (segment: string) => {
    if (segment.length <= maxLength) return [segment];

    const sentenceParts = segment
      .split(/(?<=[。！？；.!?;])/)
      .map((item) => compactText(item))
      .filter(Boolean);

    if (sentenceParts.length > 1) {
      const merged: string[] = [];
      let current = "";

      for (const sentence of sentenceParts) {
        if (sentence.length > maxLength) {
          if (current) {
            merged.push(current);
            current = "";
          }

          let start = 0;
          while (start < sentence.length) {
            const end = Math.min(sentence.length, start + maxLength);
            const part = compactText(sentence.slice(start, end));
            if (part) merged.push(part);
            if (end >= sentence.length) break;
            start = Math.max(end - overlap, start + 1);
          }
          continue;
        }

        const candidate = current ? `${current}${sentence}` : sentence;
        if (candidate.length <= maxLength) {
          current = candidate;
        } else {
          if (current) merged.push(current);
          current = sentence;
        }
      }

      if (current) merged.push(current);
      return merged;
    }

    const sliced: string[] = [];
    let start = 0;
    while (start < segment.length) {
      const end = Math.min(segment.length, start + maxLength);
      const part = compactText(segment.slice(start, end));
      if (part) sliced.push(part);
      if (end >= segment.length) break;
      start = Math.max(end - overlap, start + 1);
    }
    return sliced;
  };

  const paragraphs = source
    .split(/\n+/)
    .map((item) => compactText(item))
    .filter(Boolean);
  const pieces: string[] = [];
  let current = "";

  for (const paragraph of (paragraphs.length ? paragraphs : [source])) {
    const parts = splitLongSegment(paragraph);

    for (const part of parts) {
      if (!current) {
        current = part;
        continue;
      }

      const candidate = `${current}\n${part}`;
      if (candidate.length <= maxLength) {
        current = candidate;
      } else {
        pieces.push(current);
        current = part;
      }
    }
  }

  if (current) pieces.push(current);
  return pieces;
};

const extractSearchTerms = (value: unknown, max = 24) => {
  const source = compactText(value).toLowerCase();
  if (!source) return [];

  const asciiTerms = source.match(/[a-z0-9_+#.-]{2,}/g) || [];
  const chineseSegments = source
    .replace(/[a-z0-9_+#.-]+/g, " ")
    .split(/[^\u4e00-\u9fff]+/)
    .map((item) => compactText(item))
    .filter(Boolean);

  const chineseTerms: string[] = [];
  for (const segment of chineseSegments) {
    const cleaned = segment.replace(
      /(请问|帮我|给我|一下子|一下吧|一下|告诉我|什么是|是什么|怎么|如何|为什么|有没有|能不能|可不可以|是否|这个|那个|以及|总结一下|解释一下|分析一下|吧|呢|呀|啊|吗|的|了)/g,
      "",
    );

    if (cleaned.length < 2) continue;
    chineseTerms.push(cleaned.length <= 10 ? cleaned : cleaned.slice(0, 10));

    const seed = cleaned.length <= 12 ? cleaned : cleaned.slice(0, 12);
    for (let size = Math.min(4, seed.length); size >= 2; size -= 1) {
      for (let index = 0; index <= seed.length - size; index += 1) {
        chineseTerms.push(seed.slice(index, index + size));
        if (chineseTerms.length >= max * 3) break;
      }
      if (chineseTerms.length >= max * 3) break;
    }
  }

  const phraseTerm = source.length <= 24 ? [source] : [];
  return uniqueTerms([...asciiTerms, ...chineseTerms, ...phraseTerm], max);
};

const WEEKLY_TEXT_FIELDS: Array<[string, string, number]> = [
  ["overview_title", "本周标题", 160],
  ["overview_theme", "本周主线", 180],
  ["overview_context", "背景约束", 220],
  ["overview_one_line", "一句话目标", 180],
  ["overview_priority", "优先级提醒", 180],
  ["goal_1_title", "目标 1", 120],
  ["goal_1_detail", "目标 1 说明", 180],
  ["goal_2_title", "目标 2", 120],
  ["goal_2_detail", "目标 2 说明", 180],
  ["goal_3_title", "目标 3", 120],
  ["goal_3_detail", "目标 3 说明", 180],
  ["goals_done_definition", "完成标准", 180],
  ["goals_risks", "风险与阻塞", 180],
  ["ai_week_brief", "本周要学的大概内容", 220],
  ["ai_week_constraints", "时间约束", 160],
  ["resources_list", "资料清单", 220],
  ["resources_notes", "资料备注", 180],
  ["ai_weekly_summary", "AI 本周总结", 320],
  ["ai_weekly_progress", "AI 已推进重点", 360],
  ["ai_weekly_gaps", "AI 待补齐部分", 260],
  ["ai_next_actions", "AI 下周建议", 260],
  ["review_gain", "本周收获", 180],
  ["review_blockers", "卡点问题", 180],
  ["review_next_week", "下周延续项", 180],
  ["review_message", "给未来自己的备注", 180],
];

const WEEKLY_DAILY_FIELDS = [
  ["mon", "周一"],
  ["tue", "周二"],
  ["wed", "周三"],
  ["thu", "周四"],
  ["fri", "周五"],
  ["sat", "周六"],
  ["sun", "周日"],
] as const;

const summarizeWeeklyPlanContent = (content: Record<string, unknown> | null | undefined) => {
  if (!content || typeof content !== "object") return "";

  const sectionLines = WEEKLY_TEXT_FIELDS
    .map(([key, label, maxLength]) => {
      const value = truncate(content[key], maxLength);
      return value ? `${label}：${value}` : "";
    })
    .filter(Boolean);

  WEEKLY_DAILY_FIELDS.forEach(([prefix, label]) => {
    const title = truncate(content[`${prefix}_title`], 120);
    const tasks = truncate(content[`${prefix}_tasks`], 220);
    const note = truncate(content[`${prefix}_note`], 140);

    if (!title && !tasks && !note) return;

    sectionLines.push([
      `${label}：${title || "未写标题"}`,
      tasks ? `任务：${tasks}` : "",
      note ? `备注：${note}` : "",
    ].filter(Boolean).join("；"));
  });

  return sectionLines.join("\n");
};

const hasMeaningfulWeeklyPlanContent = (content: Record<string, unknown> | null | undefined) =>
  Boolean(summarizeWeeklyPlanContent(content));

const sanitizeAssistantAnswer = (value: unknown) => stripMarkdownSyntax(value);

const fetchAllowedPublicData = async (supabase: ReturnType<typeof createServiceClient>): Promise<PublicDataset> => {
  const result: PublicDataset = {
    knowledgeCards: [] as Array<Record<string, unknown>>,
    cppNotes: [] as Array<Record<string, unknown>>,
    interviewTopics: [] as Array<Record<string, unknown>>,
    weeklyPlans: [] as Array<Record<string, unknown>>,
    warnings: [] as string[],
  };

  if (!supabase) {
    result.warnings.push("服务端数据库连接未配置，无法读取公开学习数据。");
    return result;
  }

  const tasks = await Promise.allSettled([
    supabase
      .from("knowledge_cards")
      .select("title, description, link")
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("cpp_guide_notes")
      .select("chapter, title, content")
      .order("created_at", { ascending: true })
      .limit(120),
    supabase
      .from("interview_topics")
      .select("category, chapter, title, summary, content, sort_order")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(180),
    supabase
      .from("weekly_plans")
      .select("week_key, title, content")
      .order("week_key", { ascending: false })
      .limit(12),
  ]);

  const [knowledgeCardsResult, cppNotesResult, interviewTopicsResult, weeklyPlanResult] = tasks;

  if (knowledgeCardsResult.status === "fulfilled" && !knowledgeCardsResult.value.error) {
    result.knowledgeCards = knowledgeCardsResult.value.data || [];
  } else {
    result.warnings.push("读取公开知识卡片失败，回答将少一部分首页云端内容。");
  }

  if (cppNotesResult.status === "fulfilled" && !cppNotesResult.value.error) {
    result.cppNotes = cppNotesResult.value.data || [];
  } else {
    result.warnings.push("读取 C++ 云端补充内容失败。");
  }

  if (interviewTopicsResult.status === "fulfilled" && !interviewTopicsResult.value.error) {
    result.interviewTopics = interviewTopicsResult.value.data || [];
  } else {
    result.warnings.push("读取八股公开题库失败。");
  }

  if (weeklyPlanResult.status === "fulfilled" && !weeklyPlanResult.value.error) {
    const weeklyPlans = weeklyPlanResult.value.data || [];
    result.weeklyPlans = weeklyPlans.filter((item) => hasMeaningfulWeeklyPlanContent(item.content as Record<string, unknown>));
  } else {
    result.warnings.push("读取 Weekly Plans 公开数据失败。");
  }

  return result;
};

const buildContextChunks = ({
  pageType,
  contextTitle,
  contextText,
}: {
  pageType: PageType;
  contextTitle: string;
  contextText: string;
}) => {
  if (!contextText) return [] as RetrievalChunk[];

  const parts = splitIntoChunks(contextText, 560, 90);
  return parts.map((part, index) => ({
    id: `page-context-${index + 1}`,
    sourceKey: "page-context",
    sourceType: "page_context" as const,
    pageType,
    sourceLabel: "当前页面公开上下文",
    title: parts.length > 1 ? `${contextTitle}（片段 ${index + 1}）` : contextTitle,
    text: part,
  }));
};

const buildPublicDataChunks = (dataset: PublicDataset) => {
  const chunks: RetrievalChunk[] = [];

  dataset.knowledgeCards.forEach((item, index) => {
    const title = compactText(item.title) || `知识卡片 ${index + 1}`;
    const text = [
      `标题：${title}`,
      item.description ? `简介：${compactText(item.description)}` : "",
      item.link ? `链接：${compactText(item.link)}` : "",
    ].filter(Boolean).join("\n");

    chunks.push({
      id: `knowledge-card-${index + 1}`,
      sourceKey: `knowledge-card-${index + 1}`,
      sourceType: "knowledge_card",
      pageType: "index_home",
      sourceLabel: "首页公开知识卡片",
      title,
      text,
    });
  });

  dataset.cppNotes.forEach((item, index) => {
    const chapter = compactText(item.chapter || "其他补充");
    const title = compactText(item.title) || `C++ 公开补充 ${index + 1}`;
    const parts = splitIntoChunks(item.content, 560, 90);

    parts.forEach((part, partIndex) => {
      chunks.push({
        id: `cpp-note-${index + 1}-${partIndex + 1}`,
        sourceKey: `cpp-note-${index + 1}`,
        sourceType: "cpp_note",
        pageType: "cpp_thread",
        sourceLabel: "C++ 页面公开云端补充",
        title: `${chapter} / ${title}${parts.length > 1 ? `（片段 ${partIndex + 1}）` : ""}`,
        text: part,
      });
    });
  });

  dataset.interviewTopics.forEach((item, index) => {
    const category = compactText(item.category || "面试八股");
    const chapter = compactText(item.chapter || "未命名章节");
    const title = compactText(item.title) || `题目 ${index + 1}`;
    const combined = [
      item.summary ? `一句话摘要：${compactText(item.summary)}` : "",
      item.content ? `题目内容：${compactText(item.content)}` : "",
    ].filter(Boolean).join("\n\n");
    const parts = splitIntoChunks(combined, 560, 90);

    parts.forEach((part, partIndex) => {
      chunks.push({
        id: `interview-topic-${index + 1}-${partIndex + 1}`,
        sourceKey: `interview-topic-${index + 1}`,
        sourceType: "interview_topic",
        pageType: "interview_guide",
        sourceLabel: "八股页面公开题库",
        title: `${category} / ${chapter} / ${title}${parts.length > 1 ? `（片段 ${partIndex + 1}）` : ""}`,
        text: part,
      });
    });
  });

  dataset.weeklyPlans.forEach((item, index) => {
    const weekKey = compactText(item.week_key) || `week-${index + 1}`;
    const title = compactText(item.title) || weekKey;
    const summary = summarizeWeeklyPlanContent(item.content as Record<string, unknown>);
    const parts = splitIntoChunks(
      [
        `周次：${weekKey}`,
        title ? `标题：${title}` : "",
        summary,
      ].filter(Boolean).join("\n"),
      560,
      90,
    );

    parts.forEach((part, partIndex) => {
      chunks.push({
        id: `weekly-plan-${weekKey}-${partIndex + 1}`,
        sourceKey: `weekly-plan-${weekKey}`,
        sourceType: "weekly_plan",
        pageType: "weekly_plans",
        sourceLabel: "Weekly Plans 公开数据",
        title: `${weekKey}${title ? ` / ${title}` : ""}${parts.length > 1 ? `（片段 ${partIndex + 1}）` : ""}`,
        text: part,
      });
    });
  });

  return chunks;
};

const rankChunks = ({
  chunks,
  question,
  pageType,
  actionMode,
  contextTitle,
}: {
  chunks: RetrievalChunk[];
  question: string;
  pageType: PageType;
  actionMode: ActionMode;
  contextTitle: string;
}) => {
  const normalizedQuestion = compactText(question).toLowerCase();
  const questionTerms = extractSearchTerms(question, 26);
  const contextTerms = extractSearchTerms(contextTitle, 8);

  return chunks.map((chunk) => {
    const searchableText = `${chunk.sourceLabel}\n${chunk.title}\n${chunk.text}`.toLowerCase();
    const titleText = chunk.title.toLowerCase();
    let lexicalScore = 0;
    let termHits = 0;
    let titleHits = 0;
    let contextHits = 0;
    const wholeQuestionMatch = normalizedQuestion.length >= 4 && searchableText.includes(normalizedQuestion);

    for (const term of questionTerms) {
      const inTitle = titleText.includes(term);
      const inText = searchableText.includes(term);
      if (!inTitle && !inText) continue;

      termHits += 1;
      if (inTitle) {
        titleHits += 1;
        lexicalScore += Math.min(24, Math.max(8, term.length * 3));
      } else {
        lexicalScore += Math.min(14, Math.max(4, term.length * 2));
      }
    }

    for (const term of contextTerms) {
      if (!term || !searchableText.includes(term)) continue;
      contextHits += 1;
    }

    let sourceBoost = 0;
    if (chunk.pageType === pageType) sourceBoost += 8;
    if (chunk.sourceType === "page_context") sourceBoost += 10;
    if (pageType === "cpp_thread" && chunk.sourceType === "cpp_note") sourceBoost += 8;
    if (pageType === "interview_guide" && chunk.sourceType === "interview_topic") sourceBoost += 8;
    if (pageType === "weekly_plans" && chunk.sourceType === "weekly_plan") sourceBoost += 8;
    if ((actionMode === "weekly_plan" || actionMode === "weekly_summary") && chunk.sourceType === "weekly_plan") sourceBoost += 10;
    if ((actionMode === "weekly_plan" || actionMode === "weekly_summary") && chunk.sourceType === "page_context") sourceBoost += 12;
    if (actionMode === "interview_followup" && (chunk.sourceType === "interview_topic" || chunk.sourceType === "page_context")) {
      sourceBoost += 10;
    }

    const score = lexicalScore + (wholeQuestionMatch ? 28 : 0) + (contextHits * 2) +
      (lexicalScore || wholeQuestionMatch || contextHits ? sourceBoost : Math.floor(sourceBoost / 4));

    return {
      ...chunk,
      score,
      termHits,
      titleHits,
      contextHits,
      wholeQuestionMatch,
    };
  });
};

const buildFallbackPool = ({
  rankedChunks,
  pageType,
  actionMode,
}: {
  rankedChunks: RankedChunk[];
  pageType: PageType;
  actionMode: ActionMode;
}) => {
  if (actionMode === "weekly_plan" || actionMode === "weekly_summary") {
    return rankedChunks.filter((item) => item.sourceType === "page_context" || item.sourceType === "weekly_plan");
  }

  if (actionMode === "interview_followup" || pageType === "interview_guide") {
    return rankedChunks.filter((item) => item.sourceType === "page_context" || item.sourceType === "interview_topic");
  }

  if (pageType === "cpp_thread") {
    return rankedChunks.filter((item) => item.sourceType === "page_context" || item.sourceType === "cpp_note");
  }

  return rankedChunks.filter((item) => item.sourceType === "page_context" || item.pageType === pageType);
};

const selectRelevantChunks = ({
  question,
  pageType,
  actionMode,
  contextTitle,
  contextText,
  publicDataset,
}: {
  question: string;
  pageType: PageType;
  actionMode: ActionMode;
  contextTitle: string;
  contextText: string;
  publicDataset: PublicDataset;
}) => {
  const allChunks = [
    ...buildContextChunks({ pageType, contextTitle, contextText }),
    ...buildPublicDataChunks(publicDataset),
  ];
  const maxChunks = ACTION_RETRIEVAL_CHUNK_LIMITS[actionMode] || ACTION_RETRIEVAL_CHUNK_LIMITS.general;
  const rankedChunks = rankChunks({
    chunks: allChunks,
    question,
    pageType,
    actionMode,
    contextTitle,
  }).sort((left, right) =>
    right.score - left.score ||
    right.termHits - left.termHits ||
    right.titleHits - left.titleHits ||
    left.text.length - right.text.length
  );

  const selected: RankedChunk[] = [];
  const sourceCounts = new Map<string, number>();
  const pushChunk = (chunk: RankedChunk) => {
    if (selected.length >= maxChunks) return;
    if (selected.some((item) => item.id === chunk.id)) return;
    if ((sourceCounts.get(chunk.sourceKey) || 0) >= 2) return;

    selected.push(chunk);
    sourceCounts.set(chunk.sourceKey, (sourceCounts.get(chunk.sourceKey) || 0) + 1);
  };

  rankedChunks
    .filter((item) => item.termHits > 0 || item.wholeQuestionMatch || item.contextHits > 0)
    .forEach(pushChunk);

  if (selected.length < Math.min(3, maxChunks)) {
    buildFallbackPool({ rankedChunks, pageType, actionMode }).forEach(pushChunk);
  }

  return {
    totalChunks: allChunks.length,
    selectedChunks: selected.slice(0, maxChunks),
  };
};

const buildRetrievedContextSummary = ({
  selectedChunks,
  warnings,
}: {
  selectedChunks: RankedChunk[];
  warnings: string[];
}) => {
  const sections: string[] = [];

  if (selectedChunks.length) {
    sections.push(
      [
        "与本次问题最相关的站点公开片段：",
        ...selectedChunks.map((chunk, index) => {
          const lines = [
            `[片段 ${index + 1}] ${chunk.sourceLabel}`,
            `标题：${chunk.title}`,
            `内容：${truncate(chunk.text, 580)}`,
          ];
          return lines.join("\n");
        }),
      ].join("\n\n"),
    );
  } else {
    sections.push("本次没有检索到足够相关的站点公开片段。");
  }

  if (warnings.length) {
    sections.push(`公开数据读取提示：${warnings.join("；")}`);
  }

  return sections.join("\n\n");
};

const buildSystemPrompt = () => [
  "你是 LCQ.Space 的统一 AI 学习助手。",
  "你在引用站点内容时，只能使用当前请求附带的页面公开上下文，以及服务端检索出的站点公开学习片段。",
  "你可以使用自己的通用知识和经验做解释、教学、举例和方法建议，但必须和站点公开数据严格区分，不能把通用知识伪装成站内事实。",
  "你绝对不能访问、引用或假装知道以下内容：私密留言板、爸妈历史留言、隐藏身份数据、管理员专属内容、未公开草稿、任何密钥或内部配置。",
  "如果用户追问站内事实、个人状态或私密信息，而公开数据里没有，必须直接说明“基于当前公开数据我无法确认这部分站内信息”。",
  "回答必须用简体中文，尽量准确、克制、贴近当前学习场景。",
  "默认输出纯文本，不要使用 Markdown 标题、粗体、代码围栏、反引号；如果需要分点，直接用简洁短句或普通短横线。",
  "当你是在 C++ 或八股页面回答时，应优先围绕当前章节/题目讲解，而不是泛泛而谈。",
  "当站点公开片段不足以支撑结论时：如果你给的是站内推断，请明确标注“基于当前公开数据推断”；如果你给的是通用解释，请明确标注“补充说明（通用知识）”。",
].join("\n");

const buildUserPrompt = ({
  pageType,
  actionMode,
  question,
  contextScope,
  contextTitle,
  retrievedContextSummary,
}: {
  pageType: PageType;
  actionMode: ActionMode;
  question: string;
  contextScope: string;
  contextTitle: string;
  retrievedContextSummary: string;
}) => {
  const pageLine = `当前页面：${pageType}`;
  const contextLine = `上下文范围：${contextScope || "未指定"}`;
  const titleLine = `上下文标题：${contextTitle || "未命名上下文"}`;
  const retrievalBlock = `站点公开数据检索结果：\n${retrievedContextSummary}`;

  if (actionMode === "weekly_plan") {
    return [
      pageLine,
      contextLine,
      titleLine,
      retrievalBlock,
      `用户需求：${question}`,
      "请根据当前周公开内容，一次性补全 Weekly Plans 的四个章节：本周概览、周目标拆解、每日计划、学习资料区。",
      "本次不要生成本周复盘区内容，也不要填写 AI 周总结区。",
      "只返回 JSON，不要添加解释说明。",
      "JSON 结构必须严格为：",
      '{"overview":{"title":"","theme":"","context":"","one_line":"","priority":""},"goals":{"goal_1":{"title":"","detail":""},"goal_2":{"title":"","detail":""},"goal_3":{"title":"","detail":""},"done_definition":"","risks":""},"daily_plan":{"monday":{"title":"","tasks":["",""],"note":""},"tuesday":{"title":"","tasks":["",""],"note":""},"wednesday":{"title":"","tasks":["",""],"note":""},"thursday":{"title":"","tasks":["",""],"note":""},"friday":{"title":"","tasks":["",""],"note":""},"saturday":{"title":"","tasks":["",""],"note":""},"sunday":{"title":"","tasks":["",""],"note":""}},"resources":{"list":["",""],"notes":["",""]}}',
      "要求：",
      "- overview 要围绕“本周要学的大概内容”和“时间约束/节奏偏好”生成，语气自然、可直接回填。",
      "- goals 需要给出 3 个清晰目标，并补充完成标准与主要风险。",
      "- daily_plan 的 tasks 每天必须是 2 到 5 条可执行事项。",
      "- resources.list 填这周建议查看的资料、关键词、题目或文章；resources.notes 填使用建议、注意点或待查问题。",
      "- 如果上下文没有足够信息，就基于当前公开周计划做谨慎拆解，不要编造私密安排。",
    ].join("\n\n");
  }

  if (actionMode === "weekly_summary") {
    return [
      pageLine,
      contextLine,
      titleLine,
      retrievalBlock,
      `用户需求：${question}`,
      "请只基于当前周 Weekly Plans 的公开内容，总结本周学习进度。",
      "只返回 JSON，不要添加解释说明。",
      "JSON 结构必须严格为：",
      '{"overall_summary":"","progress_points":["",""],"gaps":["",""],"next_actions":["",""]}',
      "要求：overall_summary 是 1 段整体总结；其余 3 个字段都是字符串数组；不要引用任何私密内容。",
    ].join("\n\n");
  }

  if (actionMode === "interview_followup") {
    return [
      pageLine,
      contextLine,
      titleLine,
      retrievalBlock,
      `用户需求：${question}`,
      "请以面试官身份继续追问，默认输出 5 个循序渐进的问题。",
      "每个问题后补一句“考察点”，最后再给 3 条答题提醒。",
      "所有追问都必须基于当前公开题目上下文，不要跳出题目范围。",
    ].join("\n\n");
  }

  return [
    pageLine,
    contextLine,
    titleLine,
    retrievalBlock,
    `用户问题：${question}`,
    "请优先基于上述公开片段回答。",
    "如果公开片段不足以回答通用知识问题，可以直接给出你的通用解释、经验或做法建议，并在开头明确写“补充说明（通用知识）”。",
    "如果用户问的是站内事实、个人状态、私密内容或公开数据中不存在的具体站内细节，而公开片段不足，则必须明确说“基于当前公开数据我无法确认这部分站内信息”。",
  ].join("\n\n");
};

const callDeepSeek = async ({
  prompt,
  structured,
}: {
  prompt: string;
  structured: boolean;
}) => {
  const body: Record<string, unknown> = {
    model: DEEPSEEK_MODEL,
    temperature: structured ? 0.45 : 0.6,
    messages: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: prompt },
    ],
  };

  if (structured) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(DEEPSEEK_API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `DeepSeek 请求失败（HTTP ${response.status}）`;
    throw new Error(message);
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("DeepSeek 没有返回有效内容。");
  }

  return content;
};

const normalizeDailyPlan = (raw: Record<string, unknown>) => {
  const source = raw.daily_plan && typeof raw.daily_plan === "object" ? raw.daily_plan as Record<string, Record<string, unknown>> : raw as Record<string, Record<string, unknown>>;
  const days = [
    ["monday", "周一"],
    ["tuesday", "周二"],
    ["wednesday", "周三"],
    ["thursday", "周四"],
    ["friday", "周五"],
    ["saturday", "周六"],
    ["sunday", "周日"],
  ] as const;

  const dailyPlan = Object.fromEntries(
    days.map(([key, label]) => {
      const item = source[key] || {};
      return [
        key,
        {
          title: compactText(item.title) || `${label}学习安排`,
          tasks: toBulletLines(item.tasks).slice(0, 5),
          note: compactText(item.note),
        },
      ];
    }),
  );

  return { dailyPlan };
};

const normalizeWeeklyWorkbook = (raw: Record<string, unknown>) => {
  const overviewSource = raw.overview && typeof raw.overview === "object"
    ? raw.overview as Record<string, unknown>
    : {};
  const goalsSource = raw.goals && typeof raw.goals === "object"
    ? raw.goals as Record<string, unknown>
    : {};
  const resourcesSource = raw.resources && typeof raw.resources === "object"
    ? raw.resources as Record<string, unknown>
    : {};
  const normalizedDailyPlan = normalizeDailyPlan(raw);

  const normalizeGoal = (value: unknown, fallbackTitle: string) => {
    const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return {
      title: compactText(source.title) || fallbackTitle,
      detail: compactText(source.detail),
    };
  };

  return {
    overview: {
      title: compactText(overviewSource.title),
      theme: compactText(overviewSource.theme),
      context: compactText(overviewSource.context),
      oneLine: compactText(overviewSource.one_line),
      priority: compactText(overviewSource.priority),
    },
    goals: {
      goal1: normalizeGoal(goalsSource.goal_1, "目标一"),
      goal2: normalizeGoal(goalsSource.goal_2, "目标二"),
      goal3: normalizeGoal(goalsSource.goal_3, "目标三"),
      doneDefinition: compactText(goalsSource.done_definition),
      risks: compactText(goalsSource.risks),
    },
    dailyPlan: normalizedDailyPlan.dailyPlan,
    resources: {
      list: toBulletLines(resourcesSource.list),
      notes: toBulletLines(resourcesSource.notes),
    },
  };
};

const normalizeWeeklySummary = (raw: Record<string, unknown>) => ({
  overallSummary: compactText(raw.overall_summary),
  progressPoints: toBulletLines(raw.progress_points),
  gaps: toBulletLines(raw.gaps),
  nextActions: toBulletLines(raw.next_actions),
});

const formatDailyPlanAnswer = (dailyPlan: ReturnType<typeof normalizeDailyPlan>["dailyPlan"]) => {
  const labelMap: Record<string, string> = {
    monday: "周一",
    tuesday: "周二",
    wednesday: "周三",
    thursday: "周四",
    friday: "周五",
    saturday: "周六",
    sunday: "周日",
  };

  return [
    "已根据当前公开周计划拆出本周每日安排：",
    ...Object.entries(dailyPlan).map(([key, item]) => {
      const taskLines = item.tasks.length ? item.tasks.map((task) => `- ${task}`).join("\n") : "- 暂无具体任务";
      const noteLine = item.note ? `备注：${item.note}` : "备注：无";
      return `\n${labelMap[key]}：${item.title}\n${taskLines}\n${noteLine}`;
    }),
  ].join("\n");
};

const formatWeeklyWorkbookAnswer = (workbook: ReturnType<typeof normalizeWeeklyWorkbook>) => {
  const dailyHighlights = Object.entries(workbook.dailyPlan).map(([key, item]) => {
    const labelMap: Record<string, string> = {
      monday: "周一",
      tuesday: "周二",
      wednesday: "周三",
      thursday: "周四",
      friday: "周五",
      saturday: "周六",
      sunday: "周日",
    };
    return `${labelMap[key]}：${item.title}`;
  }).join("\n");

  return [
    "已根据当前公开周计划自动补全以下四个章节：",
    "",
    "1. 本周概览",
    workbook.overview.title || "已生成",
    workbook.overview.oneLine || workbook.overview.theme || "已补充概览信息",
    "",
    "2. 周目标拆解",
    `- ${workbook.goals.goal1.title}`,
    `- ${workbook.goals.goal2.title}`,
    `- ${workbook.goals.goal3.title}`,
    "",
    "3. 每日计划",
    dailyHighlights,
    "",
    "4. 学习资料区",
    workbook.resources.list.length ? workbook.resources.list.map((item) => `- ${item}`).join("\n") : "已补充资料建议",
  ].join("\n");
};

const formatWeeklySummaryAnswer = (summary: ReturnType<typeof normalizeWeeklySummary>) => {
  const progress = summary.progressPoints.length ? summary.progressPoints.map((item) => `- ${item}`).join("\n") : "- 暂未识别到明确已推进项";
  const gaps = summary.gaps.length ? summary.gaps.map((item) => `- ${item}`).join("\n") : "- 暂未识别到明确待补齐项";
  const nextActions = summary.nextActions.length ? summary.nextActions.map((item) => `- ${item}`).join("\n") : "- 暂无明确下一步建议";

  return [
    "本周学习进度总结：",
    summary.overallSummary || "基于当前公开周计划，暂时只能做出较保守的总结。",
    "",
    "已推进的重点：",
    progress,
    "",
    "仍待补齐的部分：",
    gaps,
    "",
    "下周延续建议：",
    nextActions,
  ].join("\n");
};

const fetchHistory = async (supabase: ReturnType<typeof createServiceClient>) => {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("ai_learning_logs")
    .select("id, page_type, page_key, actor_role, context_scope, context_title, user_question, ai_answer, created_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(10);

  if (error) {
    throw new Error(error.message || "读取 AI 历史失败。");
  }

  return (data || []) as HistoryRow[];
};

const insertHistory = async (
  supabase: ReturnType<typeof createServiceClient>,
  row: Omit<HistoryRow, "id" | "created_at">,
) => {
  if (!supabase) return;

  const { error } = await supabase.from("ai_learning_logs").insert([row]);
  if (error) {
    throw new Error(error.message || "写入 AI 历史失败。");
  }
};

const deleteHistory = async (
  supabase: ReturnType<typeof createServiceClient>,
  historyId: number,
) => {
  if (!supabase) {
    throw new Error("服务端数据库连接未配置，无法删除 AI 历史。");
  }

  const { error } = await supabase
    .from("ai_learning_logs")
    .delete()
    .eq("id", historyId);

  if (error) {
    throw new Error(error.message || "删除 AI 历史失败。");
  }
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  let payload: ChatRequest = {};
  try {
    payload = await request.json();
  } catch {
    return json({ error: "请求体不是有效 JSON。" }, 400);
  }

  const action = payload.action || "chat";
  const serviceClient = createServiceClient();
  const configPayload = {
    configured: isConfigured(),
    provider: "DeepSeek",
    endpointDisplay: DEEPSEEK_API_ENDPOINT || DEFAULT_DEEPSEEK_ENDPOINT,
    model: DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL,
    storage: "Supabase Edge Function 环境变量",
    capabilities: {
      deleteHistory: true,
      generalKnowledgeFallback: true,
      retrievalMode: "chunk-search-v1",
    },
  };

  if (action === "config-status") {
    return json(configPayload);
  }

  if (action === "history") {
    try {
      const history = await fetchHistory(serviceClient);
      return json({ ...configPayload, history });
    } catch (error) {
      return json({
        ...configPayload,
        history: [],
        error: error instanceof Error ? error.message : "读取历史失败。",
      });
    }
  }

  if (action === "delete-history") {
    const actorRole = normalizeActorRole(payload.actorRole);
    const historyId = normalizeHistoryId(payload.historyId);

    if (!MANAGE_HISTORY_ROLES.has(actorRole)) {
      return json({
        ...configPayload,
        error: "当前只有管理员可以删除 AI 历史。",
      }, 403);
    }

    if (!historyId) {
      return json({
        ...configPayload,
        error: "缺少有效的历史记录 ID。",
      }, 400);
    }

    try {
      await deleteHistory(serviceClient, historyId);
      const history = await fetchHistory(serviceClient);
      return json({ ...configPayload, history });
    } catch (error) {
      return json({
        ...configPayload,
        error: error instanceof Error ? error.message : "删除 AI 历史失败。",
      }, 500);
    }
  }

  if (!configPayload.configured) {
    return json(
      {
        ...configPayload,
        error: "服务端 AI 尚未配置完成，请先在 Supabase Edge Function 环境变量中设置 DeepSeek Key。",
      },
      503,
    );
  }

  const pageType = normalizePageType(payload.pageType);
  const pageKey = truncate(payload.pageKey || pageType, 120);
  const actorRole = normalizeActorRole(payload.actorRole);
  const actionMode = normalizeActionMode(payload.actionMode);
  const question = compactText(payload.question);
  const contextScope = truncate(payload.context?.scope || "current_page", 80);
  const contextTitle = truncate(payload.context?.title || "当前页面", 200);
  const contextText = truncate(payload.context?.content || "", 4200);

  if (!question) {
    return json({ error: "问题不能为空。" }, 400);
  }

  try {
    const publicDataset = await fetchAllowedPublicData(serviceClient);
    const retrieval = selectRelevantChunks({
      question,
      pageType,
      actionMode,
      contextTitle,
      contextText,
      publicDataset,
    });
    const retrievedContextSummary = buildRetrievedContextSummary({
      selectedChunks: retrieval.selectedChunks,
      warnings: publicDataset.warnings,
    });
    const prompt = buildUserPrompt({
      pageType,
      actionMode,
      question,
      contextScope,
      contextTitle,
      retrievedContextSummary,
    });

    const rawContent = await callDeepSeek({
      prompt,
      structured: actionMode === "weekly_plan" || actionMode === "weekly_summary",
    });

    let answer = sanitizeAssistantAnswer(rawContent);
    let structuredData: Record<string, unknown> | null = null;

    if (actionMode === "weekly_plan") {
      const parsed = extractJson(rawContent);
      const normalized = normalizeWeeklyWorkbook(parsed);
      structuredData = normalized;
      answer = sanitizeAssistantAnswer(formatWeeklyWorkbookAnswer(normalized));
    } else if (actionMode === "weekly_summary") {
      const parsed = extractJson(rawContent);
      const normalized = normalizeWeeklySummary(parsed);
      structuredData = normalized;
      answer = sanitizeAssistantAnswer(formatWeeklySummaryAnswer(normalized));
    }

    await insertHistory(serviceClient, {
      page_type: pageType,
      page_key: pageKey,
      actor_role: actorRole,
      context_scope: contextScope,
      context_title: contextTitle,
      user_question: question,
      ai_answer: answer,
    });

    const history = await fetchHistory(serviceClient);

    return json({
      ...configPayload,
      answer,
      structuredData,
      history,
    });
  } catch (error) {
    return json(
      {
        ...configPayload,
        error: error instanceof Error ? error.message : "AI 处理失败。",
      },
      500,
    );
  }
});
