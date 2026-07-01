import { listen } from "@tauri-apps/api/event";
import { invokeCommand } from "./tauriService";
import {
  AiConfigDto,
  AiConfigUpdate,
  KnowledgeProgress,
  KnowledgeStatus,
  NlSqlResult,
  SchemaContext,
  SuggestedQuery,
} from "../models/ai";

export function getAiConfig(): Promise<AiConfigDto> {
  return invokeCommand<AiConfigDto>("ai_get_config");
}

export function updateAiConfig(update: AiConfigUpdate): Promise<AiConfigDto> {
  return invokeCommand<AiConfigDto>("ai_update_config", { update });
}

export function buildAiSchemaContext(
  connectionId: string,
  tableFilter?: string | null,
): Promise<SchemaContext> {
  return invokeCommand<SchemaContext>("ai_build_schema_context", {
    connectionId,
    tableFilter: tableFilter ?? null,
  });
}

export function explainSchema(
  requestId: string,
  connectionId: string,
  tableFilter?: string | null,
): Promise<string> {
  return invokeCommand<string>("ai_explain_schema", {
    requestId,
    connectionId,
    tableFilter: tableFilter ?? null,
  });
}

export function generateSql(
  requestId: string,
  connectionId: string,
  question: string,
): Promise<NlSqlResult> {
  return invokeCommand<NlSqlResult>("ai_generate_sql", {
    requestId,
    connectionId,
    question,
  });
}

export function advisePerformance(
  requestId: string,
  connectionId: string,
  sql: string,
): Promise<string> {
  return invokeCommand<string>("ai_advise_performance", {
    requestId,
    connectionId,
    sql,
  });
}

/** Ask the AI to fix a query that failed, given its error message. */
export function fixSql(
  requestId: string,
  connectionId: string,
  sql: string,
  errorMessage: string,
): Promise<NlSqlResult> {
  return invokeCommand<NlSqlResult>("ai_fix_sql", {
    requestId,
    connectionId,
    sql,
    errorMessage,
  });
}

/** AI-suggested questions, each paired with a ready-to-run SQL query —
 * grounded in real sampled data when a knowledge base has been built. */
export function suggestQuestions(connectionId: string): Promise<SuggestedQuery[]> {
  return invokeCommand<SuggestedQuery[]>("ai_suggest_questions", { connectionId });
}

/** Current status of a connection's persisted schema knowledge base. */
export function getKnowledgeStatus(connectionId: string): Promise<KnowledgeStatus> {
  return invokeCommand<KnowledgeStatus>("ai_knowledge_status", { connectionId });
}

/** Build (or incrementally refresh) the knowledge base for a connection.
 * Streams per-table progress via `subscribeKnowledgeProgress`. */
export function buildKnowledge(requestId: string, connectionId: string): Promise<KnowledgeStatus> {
  return invokeCommand<KnowledgeStatus>("ai_build_knowledge", { requestId, connectionId });
}

/**
 * Subscribe to per-table progress events for a knowledge-base build. Returns
 * an unsubscribe function. Call this BEFORE invoking `buildKnowledge` so no
 * early events are missed.
 */
export async function subscribeKnowledgeProgress(
  requestId: string,
  onProgress: (progress: KnowledgeProgress) => void,
): Promise<() => void> {
  const unlisten = await listen<KnowledgeProgress>(`ai-knowledge-progress-${requestId}`, (event) => {
    onProgress(event.payload);
  });
  return unlisten;
}

/**
 * Subscribe to streaming text deltas for an AI request. Returns an unsubscribe
 * function. Call this BEFORE invoking the command so no early deltas are missed.
 */
export async function subscribeAiStream(
  requestId: string,
  onDelta: (text: string) => void,
): Promise<() => void> {
  const unlisten = await listen<string>(`ai-delta-${requestId}`, (event) => {
    onDelta(event.payload);
  });
  return unlisten;
}

/** Generate a unique request id for routing streaming events. */
export function newRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
