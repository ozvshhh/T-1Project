import type { JsonRequest, LlmClient } from '../src/llm.js';
import type { MainQuestionsOutput, SuggestionsOutput, TurnOutput } from '../src/schemas.js';

type Handler = {
  main_questions?: (req: JsonRequest<unknown>) => MainQuestionsOutput | Promise<MainQuestionsOutput>;
  interview_turn?: (req: JsonRequest<unknown>, call: number) => TurnOutput | Promise<TurnOutput>;
  cover_letter_suggestions?: (req: JsonRequest<unknown>) => SuggestionsOutput | Promise<SuggestionsOutput>;
};

/** 단위 테스트용 가짜 AI. 스키마 검사는 실제와 같이 통과시킨다. */
export class FakeLlm implements LlmClient {
  calls: { schemaName: string; user: string }[] = [];
  private turnCalls = 0;
  constructor(private readonly handler: Handler) {}

  async json<T>(req: JsonRequest<T>): Promise<T> {
    this.calls.push({ schemaName: req.schemaName, user: req.user });
    const h = this.handler[req.schemaName as keyof Handler];
    if (!h) throw new Error(`no handler for ${req.schemaName}`);
    const call = req.schemaName === 'interview_turn' ? this.turnCalls++ : 0;
    const out = await (h as (r: JsonRequest<unknown>, n: number) => unknown)(req as JsonRequest<unknown>, call);
    return req.schema.parse(out);
  }
}

export const COVER_LETTER =
  '팀 프로젝트에서 로그인 기능을 맡아 응답 속도를 개선했습니다. 팀원과 일정이 맞지 않아 회의 방식을 바꿨습니다.';
export const RESUME = '소프트웨어학과 4학년. 팀 프로젝트 3회. 동아리 회장.';

export const FOUR_QUESTIONS: MainQuestionsOutput = {
  questions: [
    {
      interviewer: 'practical',
      purpose: '본인 기여',
      fields: ['contribution', 'process'],
      basis_sentence: '팀 프로젝트에서 로그인 기능을 맡아 응답 속도를 개선했습니다.',
      question: '로그인 기능에서 직접 구현한 부분은 무엇인가요?',
    },
    {
      interviewer: 'practical',
      purpose: '검증 방법',
      fields: ['reason', 'verification'],
      basis_sentence: '이 문장은 자소서에 없습니다.',
      question: '응답 속도 개선은 어떻게 확인했나요?',
    },
    {
      interviewer: 'executive',
      purpose: '협업 과정',
      fields: ['collaboration'],
      basis_sentence: '팀원과 일정이 맞지 않아 회의 방식을 바꿨습니다.',
      question: '회의 방식을 바꾸자고 어떻게 설득했나요?',
    },
    {
      interviewer: 'executive',
      purpose: '실패 이후 행동',
      fields: ['after_failure', 'judgment'],
      basis_sentence: null,
      question: '계획대로 되지 않았을 때 어떻게 했나요?',
    },
  ],
};

export const nextMain = (): TurnOutput => ({
  check_updates: [],
  decision: 'next_main',
  target_field: null,
  basis_answer_id: null,
  conflicting_answer_id: null,
  reason: '확인 목적 충족',
  question: null,
});

/** 시간을 직접 움직일 수 있는 시계 */
export function clock(start = Date.UTC(2026, 9, 29, 12, 0, 0)) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

/** 항상 같은 순서를 내는 난수 */
export function seeded(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}
