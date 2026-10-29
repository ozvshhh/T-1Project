// 단서 파일 한도를 한 곳에 둔다(명세 05). 형식 제한은 api.md 11절 학생 답을 기다리므로 여기서는 크기만 정한다.

// 학생 답이 오기 전 기본 한도 5MB. Mongo 문서 한도(16MB) 안에 넉넉히 들어간다.
export const DEFAULT_CLUE_MAX_BYTES = 5 * 1024 * 1024;

export interface ClueConfig {
  maxBytes: number;
}

// 모듈을 만들 때 읽는다: 배포 설정(CLUE_MAX_BYTES)만으로 한도를 바꿀 수 있고, 잘못된 값이면 기본값으로 돌아간다.
export function clueConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ClueConfig {
  const maxBytes = Number(env.CLUE_MAX_BYTES);
  return {
    maxBytes: Number.isInteger(maxBytes) && maxBytes > 0 ? maxBytes : DEFAULT_CLUE_MAX_BYTES,
  };
}
