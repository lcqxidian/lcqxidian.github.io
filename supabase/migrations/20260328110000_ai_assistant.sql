create table if not exists public.ai_learning_logs (
    id bigint generated always as identity primary key,
    page_type text not null check (page_type in ('index_home', 'cpp_thread', 'interview_guide', 'weekly_plans')),
    page_key text not null default '',
    actor_role text not null default 'guest',
    context_scope text,
    context_title text,
    user_question text not null,
    ai_answer text not null,
    helpful boolean,
    created_at timestamptz not null default timezone('utc', now())
);

comment on table public.ai_learning_logs is '全站统一 AI 学习助手对话记录，只保留最近 10 轮。';
comment on column public.ai_learning_logs.page_type is '来源页面：index_home / cpp_thread / interview_guide / weekly_plans';
comment on column public.ai_learning_logs.page_key is '页面唯一键，例如 index / 2026-W13';
comment on column public.ai_learning_logs.actor_role is '前端上报的角色标签，仅作展示元数据，不可作为安全依据';
comment on column public.ai_learning_logs.context_scope is '上下文范围，例如 site_public / current_section / current_topic / current_week';
comment on column public.ai_learning_logs.context_title is '当前上下文标题，例如章节名或题目名';

create index if not exists ai_learning_logs_created_at_idx
    on public.ai_learning_logs (created_at desc, id desc);

alter table public.ai_learning_logs enable row level security;

revoke all on table public.ai_learning_logs from anon;
revoke all on table public.ai_learning_logs from authenticated;

create or replace function public.trim_ai_learning_logs_to_latest_ten()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    delete from public.ai_learning_logs
    where id in (
        select stale.id
        from public.ai_learning_logs as stale
        order by stale.created_at desc, stale.id desc
        offset 10
    );

    return null;
end;
$$;

drop trigger if exists ai_learning_logs_trim_trigger on public.ai_learning_logs;

create trigger ai_learning_logs_trim_trigger
after insert on public.ai_learning_logs
for each statement
execute function public.trim_ai_learning_logs_to_latest_ten();
