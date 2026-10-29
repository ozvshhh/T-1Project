import { z } from 'zod';

const interviewer = z.enum(['practical', 'executive']);
const field = z.enum([
  'contribution',
  'process',
  'reason',
  'verification',
  'collaboration',
  'judgment',
  'after_failure',
]);

/** 면접 시작 때 본질문 4개를 한 번에 받는 형식 */
export const MainQuestionsSchema = z.strictObject({
  questions: z.array(
    z.strictObject({
      interviewer,
      purpose: z.string(),
      fields: z.array(field),
      basis_sentence: z.string().nullable(),
      question: z.string(),
    }),
  ),
});
export type MainQuestionsOutput = z.infer<typeof MainQuestionsSchema>;

/** 답변마다 확인 상태 갱신 + 다음 행동 + 꼬리질문을 한 번에 받는 형식 */
export const TurnSchema = z.strictObject({
  check_updates: z.array(
    z.strictObject({
      field,
      status: z.enum(['explained', 'needs_more', 'unknown']),
    }),
  ),
  decision: z.enum(['follow_up', 'clarify', 'next_main']),
  target_field: field.nullable(),
  basis_answer_id: z.string().nullable(),
  conflicting_answer_id: z.string().nullable(),
  reason: z.string(),
  question: z.string().nullable(),
});
export type TurnOutput = z.infer<typeof TurnSchema>;

/** 면접이 끝난 뒤 자소서 수정 제안 */
export const SuggestionsSchema = z.strictObject({
  suggestions: z.array(
    z.strictObject({
      original: z.string(),
      revised: z.string(),
      reason: z.string(),
      answer_id: z.string(),
    }),
  ),
});
export type SuggestionsOutput = z.infer<typeof SuggestionsSchema>;
