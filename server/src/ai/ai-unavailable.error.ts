// AI 실패(키 없음·거절·타임아웃·형식 오류)를 하나로 모은다. 전역 필터가 502 AI_UNAVAILABLE로 바꾼다.
// message에는 키·원문 응답·스택을 넣지 않는다(사용자에게 그대로 나갈 수 있다).
export class AiUnavailableError extends Error {
  constructor(message = 'AI 응답을 받지 못했어요. 잠시 뒤 다시 시도해 주세요.') {
    super(message);
    this.name = 'AiUnavailableError';
  }
}
