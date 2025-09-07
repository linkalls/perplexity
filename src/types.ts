// Detailed types derived from sample `result.json` to make the client strongly typed.

/**
 * ID
 *
 * Generic identifier type used across responses.
 */
export type ID = string;

/**
 * Models
 *
 * Union of supported model names observed on the platform.
 */
export type Models =
  | "sonar"
  | "experimental"
  | "gpt5"
  | "gpt5_nano"
  | "gpt45"
  | "claude_sonnet_4_0"
  | "claude37sonnetthinking"
  | "o3mini"
  | "gemini25pro"
  | "grok"
  | "pplx_pro"
  | "pplx_reasoning"
  | "pplx_alpha"
  | "turbo";

/**
 * ClassifierResults
 *
 * Signals returned by the backend about how the response was generated and
 * which UI elements should be displayed.
 */
export interface ClassifierResults {
  personal_search: boolean;
  skip_search: boolean;
  widget_type: string;
  hide_nav: boolean;
  hide_sources: boolean;
  image_generation: boolean;
  time_widget: boolean;
}

/**
 * TelemetryData
 *
 * Optional telemetry information present in responses for diagnostics.
 */
export interface TelemetryData {
  has_displayed_search_results: boolean;
  has_first_output_token: boolean;
  has_first_token: boolean;
  country?: string;
  is_followup?: boolean;
  source?: string;
  engine_mode?: string;
  search_implementation_mode?: string;
  has_widget_data?: boolean;
  search_duration_seconds?: number;
  has_useful_renderable_content?: boolean;
  [k: string]: any;
}

/**
 * AnswerMode
 *
 * Describes alternate answer rendering modes and related flags.
 */
export interface AnswerMode {
  answer_mode_type: string;
  has_preview?: boolean;
  [k: string]: any;
}

/**
 * MediaItem
 *
 * Describes image/video/media attachments present in responses.
 */
export interface MediaItem {
  medium: "image" | "video" | string;
  image?: string;
  image_width?: number;
  image_height?: number;
  url?: string;
  name?: string;
  source?: string;
  thumbnail?: string;
  thumbnail_height?: number;
  thumbnail_width?: number;
  [k: string]: any;
}

/**
 * WidgetMetaData
 *
 * Auxiliary metadata for result widget rendering.
 */
export interface WidgetMetaData {
  client?: string;
  date?: string | null;
  citation_domain_name?: string;
  suffix?: string;
  domain_name?: string;
  description?: string | null;
  images?: string[];
  published_date?: string | null;
  [k: string]: any;
}

/**
 * WebResultItem
 *
 * A single web search result item and its snippet/metadata.
 */
export interface WebResultItem {
  name?: string;
  snippet: string | null;
  timestamp?: string | null;
  url: string;
  meta_data?: WidgetMetaData;
  is_attachment?: boolean;
  is_image?: boolean;
  is_code_interpreter?: boolean;
  is_knowledge_card?: boolean;
  is_navigational?: boolean;
  is_widget?: boolean;
  is_focused_web?: boolean;
  is_client_context?: boolean;
  is_memory?: boolean;
  is_conversation_history?: boolean;
  [k: string]: any;
}

/**
 * WebResultBlock
 *
 * Container for web search result blocks returned by the backend.
 */
export interface WebResultBlock {
  progress: string;
  web_results: WebResultItem[];
  final?: boolean;
  [k: string]: any;
}

// More precise PlanStep variant
/**
 * PlanStepBase
 *
 * Base interface for planning steps when the backend returns multi-step plans.
 */
export interface PlanStepBase {
  uuid?: ID;
  step_type: string;
  [k: string]: any;
}

/**
 * InitialQueryStep
 *
 * Planning step representing an initial user query captured in a plan.
 */
export interface InitialQueryStep extends PlanStepBase {
  step_type: "INITIAL_QUERY";
  initial_query_content: { query: string };
}

/**
 * SearchWebStep
 *
 * Planning step representing a web search action with queries.
 */
export interface SearchWebStep extends PlanStepBase {
  step_type: "SEARCH_WEB";
  search_web_content: {
    goal_id?: string;
    queries: Array<{ engine?: string; query: string; limit?: number }>;
  };
}

/**
 * SearchResultsStep
 *
 * Planning step that contains web search results for a goal.
 */
export interface SearchResultsStep extends PlanStepBase {
  step_type: "SEARCH_RESULTS";
  web_results_content: {
    goal_id?: string;
    web_results: WebResultItem[];
  };
}

/**
 * PlanStep
 *
 * Union type covering known plan step variants.
 */
export type PlanStep =
  | InitialQueryStep
  | SearchWebStep
  | SearchResultsStep
  | PlanStepBase;

/**
 * PlanGoal
 *
 * Goal descriptor inside a plan block.
 */
export interface PlanGoal {
  id: string;
  description?: string;
  final?: boolean;
  todo_task_status?: string;
}

/**
 * PlanBlock
 *
 * Structure describing a plan with goals and steps.
 */
export interface PlanBlock {
  progress: string;
  goals: PlanGoal[];
  steps?: PlanStep[];
  final?: boolean;
  [k: string]: any;
}

/**
 * MarkdownBlock
 *
 * Represents the markdown-based answer chunks and the merged answer.
 */
export interface MarkdownBlock {
  progress?: string;
  // chunks are usually strings but can occasionally include structured pieces
  chunks: string[];
  chunk_starting_offset?: number;
  // merged final answer when available
  answer?: string;
  [k: string]: any;
}

/**
 * BlockBase
 *
 * Base wrapper for typed block wrappers returned by the backend.
 */
export interface BlockBase {
  intended_usage: string;
  [k: string]: any;
}

/**
 * PlanBlockWrapper
 *
 * Wrapper containing a `plan_block` field.
 */
export interface PlanBlockWrapper extends BlockBase {
  plan_block: PlanBlock;
}

/**
 * WebResultBlockWrapper
 *
 * Wrapper containing a `web_result_block` field.
 */
export interface WebResultBlockWrapper extends BlockBase {
  web_result_block: WebResultBlock;
}

/**
 * AskTextBlockWrapper
 *
 * Wrapper containing an `markdown_block` for ask_text usages.
 */
export interface AskTextBlockWrapper extends BlockBase {
  markdown_block: MarkdownBlock;
}

// Concrete block types (discriminated by `intended_usage`) for safer access
/**
 * ProSearchStepsBlock
 *
 * Block wrapper representing pro-search planning steps.
 */
export interface ProSearchStepsBlock extends BlockBase {
  intended_usage: "pro_search_steps";
  plan_block: PlanBlock;
}

/**
 * PlanBlockType
 *
 * Typed plan block wrapper (intended_usage === 'plan').
 */
export interface PlanBlockType extends BlockBase {
  intended_usage: "plan";
  plan_block: PlanBlock;
}

/**
 * WebResultsBlock
 *
 * Typed wrapper for web result blocks (intended_usage === 'web_results').
 */
export interface WebResultsBlock extends BlockBase {
  intended_usage: "web_results";
  web_result_block: WebResultBlock;
}

/**
 * AskTextBlock
 *
 * Block representing textual answers (markdown) returned by the backend.
 */
export interface AskTextBlock {
  intended_usage: "ask_text";
  markdown_block: MarkdownBlock;
}

// generic fallback for unrecognized block kinds
/**
 * GenericBlock
 *
 * Fallback block type for unrecognized block shapes.
 */
export interface GenericBlock extends BlockBase {
  [k: string]: any;
}

/**
 * Block
 *
 * Union of known block wrapper types.
 */
export type Block =
  | ProSearchStepsBlock
  | PlanBlockType
  | WebResultsBlock
  | AskTextBlock
  | AskTextBlockWrapper
  | GenericBlock;

/**
 * PerplexityResponse
 *
 * Full aggregated response returned by the non-streaming `search` API.
 */
export interface PerplexityResponse {
  backend_uuid?: ID;
  context_uuid?: ID;
  uuid?: ID;
  frontend_context_uuid?: ID;
  frontend_uuid?: ID;
  display_model?: string;
  mode?: string;
  search_focus?: string;
  source?: string;
  attachments?: any[];
  thread_url_slug?: string;
  expect_search_results?: string | boolean;
  gpt4?: boolean;
  text_completed?: boolean;
  blocks?: Block[];
  message_mode?: string;
  reconnectable?: boolean;
  image_completions?: any[];
  cursor?: string;
  status?: string;
  final_sse_message?: boolean;
  read_write_token?: string;
  is_pro_reasoning_mode?: boolean;
  num_sources_display?: number;
  classifier_results?: ClassifierResults;
  search_implementation_mode?: string;
  telemetry_data?: TelemetryData;
  answer_modes?: AnswerMode[];
  media_items?: MediaItem[];
  expect_sponsored_results?: boolean;
  final?: boolean;
  [k: string]: any;
}

// A generic chunk type for SSE messages; shape varies between server messages.
// PerplexityChunk represents an individual SSE chunk sent by the backend.
// It largely overlaps with PerplexityResponse but commonly contains
// incremental fields such as `text`, `final_sse_message`, and `status`.
/**
 * PerplexityChunk
 *
 * Incremental SSE chunk shape emitted by the platform. Use these when
 * processing streaming responses.
 */
export interface PerplexityChunk {
  backend_uuid?: ID;
  context_uuid?: ID;
  uuid?: ID;
  frontend_context_uuid?: ID;
  frontend_uuid?: ID;
  display_model?: string;
  mode?: string;
  search_focus?: string;
  source?: string;
  attachments?: any[];
  thread_url_slug?: string;
  expect_search_results?: string | boolean;
  gpt4?: boolean;
  text_completed?: boolean;
  // `text` is sometimes a string or an array of strings (incremental chunks)
  text?: string | string[];
  // Blocks may appear incrementally
  blocks?: Block[];
  message_mode?: string;
  reconnectable?: boolean;
  image_completions?: any[];
  cursor?: string;
  status?: string;
  // signalling flags used by SSE
  final_sse_message?: boolean;
  final?: boolean;
  read_write_token?: string;
  is_pro_reasoning_mode?: boolean;
  num_sources_display?: number;
  classifier_results?: ClassifierResults;
  search_implementation_mode?: string;
  telemetry_data?: TelemetryData;
  answer_modes?: AnswerMode[];
  media_items?: MediaItem[];
  widget_data?: any[];
  expect_sponsored_results?: boolean;
  // allow extra fields without breaking typing
  [k: string]: any;
}

// Exporting for usage across the client implementation
export {};

// Exported type-guard helpers so consumers don't need to write them.
/**
 * Type-guard: isAskTextBlock
 *
 * Returns true when the provided block is an AskTextBlock.
 */
export function isAskTextBlock(b: Block | undefined | null): b is AskTextBlock {
  return (
    !!b &&
    (b as any).intended_usage === "ask_text" &&
    !!(b as any).markdown_block
  );
}

/**
 * Type-guard: isWebResultsBlock
 *
 * Returns true when the provided block is a WebResultsBlock.
 */
export function isWebResultsBlock(
  b: Block | undefined | null
): b is WebResultsBlock {
  return (
    !!b &&
    (b as any).intended_usage === "web_results" &&
    !!(b as any).web_result_block
  );
}

/**
 * Type-guard: isPlanBlock
 *
 * Returns true when the provided block is a PlanBlockType.
 */
export function isPlanBlock(b: Block | undefined | null): b is PlanBlockType {
  return !!b && (b as any).intended_usage === "plan" && !!(b as any).plan_block;
}

/**
 * Type-guard: isProSearchStepsBlock
 *
 * Returns true when the provided block is a ProSearchStepsBlock.
 */
export function isProSearchStepsBlock(
  b: Block | undefined | null
): b is ProSearchStepsBlock {
  return (
    !!b &&
    (b as any).intended_usage === "pro_search_steps" &&
    !!(b as any).plan_block
  );
}

/**
 * getAskTextBlocks(result)
 *
 * Convenience helper to extract ask_text blocks from a PerplexityResponse.
 */

// Convenience helpers that operate on a full PerplexityResponse
// and return typed blocks or extracted text/answers.
/**
 * getAskTextBlocks
 *
 * Extracts ask_text blocks from a PerplexityResponse.
 */
export function getAskTextBlocks(
  result: PerplexityResponse | null | undefined
): AskTextBlock[] {
  if (!result || !Array.isArray(result.blocks)) return [];
  return result.blocks.filter(isAskTextBlock) as AskTextBlock[];
}

/**
 * getFirstAskTextAnswer
 *
 * Returns the first merged markdown answer from ask_text blocks, if any.
 */
export function getFirstAskTextAnswer(
  result: PerplexityResponse | null | undefined
): string | undefined {
  const blocks = getAskTextBlocks(result);
  if (!blocks.length) return undefined;
  const md = blocks[0].markdown_block;
  if (md.answer) return md.answer;
  // fallback: join normalized chunks
  const chunks = Array.isArray(md.chunks)
    ? md.chunks
    : md.chunks
    ? [md.chunks]
    : [];
  if (chunks.length) return chunks.join("");
  return undefined;
}

/**
 * getWebResultsBlocks
 *
 * Extract typed web result blocks from a PerplexityResponse.
 */
export function getWebResultsBlocks(
  result: PerplexityResponse | null | undefined
): WebResultsBlock[] {
  if (!result || !Array.isArray(result.blocks)) return [];
  return result.blocks.filter(isWebResultsBlock) as WebResultsBlock[];
}

/**
 * getPlanBlocks
 *
 * Extract typed plan blocks from a PerplexityResponse.
 */
export function getPlanBlocks(
  result: PerplexityResponse | null | undefined
): PlanBlockType[] {
  if (!result || !Array.isArray(result.blocks)) return [];
  return result.blocks.filter(isPlanBlock) as PlanBlockType[];
}

/**
 * getProSearchStepsBlocks
 *
 * Extract pro-search step blocks from a PerplexityResponse.
 */
export function getProSearchStepsBlocks(
  result: PerplexityResponse | null | undefined
): ProSearchStepsBlock[] {
  if (!result || !Array.isArray(result.blocks)) return [];
  return result.blocks.filter(isProSearchStepsBlock) as ProSearchStepsBlock[];
}
