// jest setupFiles: 모든 테스트 파일 실행 전에 전역 fetch를 막는다.
// 테스트가 실수로 실제 AI Gateway를 부르면 팀 예산($10)이 줄어들기 때문이다. 필요한 테스트는 자기 가짜 fetch로 바꿔 쓴다.
export const NO_NETWORK_MESSAGE = '테스트에서 실제 네트워크 호출 금지';

globalThis.fetch = (): Promise<Response> => Promise.reject(new Error(NO_NETWORK_MESSAGE));
