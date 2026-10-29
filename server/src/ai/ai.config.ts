// AI 호출의 이름·숫자를 한 곳에 둔다(명세 04). 환경변수는 호출 시점에 읽어 배포 설정만으로 바꿀 수 있게 한다.

// Vercel AI Gateway의 OpenAI 호환 주소.
export const DEFAULT_AI_GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/v1';

// 팀 결정 모델(2026-10-29, interview-engine README).
export const DEFAULT_AI_MODEL = 'openai/gpt-6.1-terra';

// 응답이 이보다 늦으면 끊는다. 사용자가 무한정 기다리지 않게 한다.
export const DEFAULT_AI_TIMEOUT_MS = 30_000;

// 네트워크·5xx·형식 오류에 한해 다시 부르는 횟수. 비용 상한($10) 때문에 1회로 묶는다.
export const AI_MAX_RETRIES = 1;

export interface AiConfig {
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export function aiConfigFromEnv(): AiConfig {
  const timeout = Number(process.env.AI_TIMEOUT_MS);
  const baseUrl = process.env.AI_GATEWAY_BASE_URL?.trim() || DEFAULT_AI_GATEWAY_BASE_URL;
  return {
    // 끝 슬래시를 지워 `.../v1//chat/completions`가 되지 않게 한다.
    baseUrl: baseUrl.replace(/\/+$/, ''),
    model: process.env.AI_MODEL?.trim() || DEFAULT_AI_MODEL,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_AI_TIMEOUT_MS,
  };
}
