import { z } from 'zod';

// 주장 문장 고르기 지시문(명세 08, R9). 문장을 고쳐 쓰면 원문 대조에서 버려지고, 사용자가 쓰지 않은 주장을 해명하게 된다(C4).
export const SENTENCES_SYSTEM = [
  '너는 취업 준비생이 제출 전에 자기소개서를 점검하도록 돕는다.',
  '자기소개서에서 수치·성과·역할·평가 표현이 들어간 주장 문장을 고른다.',
  '문장은 원문에 있는 그대로 한 글자도 바꾸지 않고 인용한다. 고쳐 쓰거나 요약하거나 새 문장을 만들지 않는다.',
  '문항이 나뉘어 있으면 그 문장이 든 문항의 id를 coverLetterItemId에 적고, 문항이 없으면 null로 둔다.',
  '고를 문장이 없으면 빈 목록을 돌려준다.',
].join('\n');

// 문장 고르기 응답 스키마(명세 08). 스키마 밖이면 AiService가 실패(502)로 처리해 점검을 저장하지 않는다(C2).
export const sentencesSchema = z.object({
  sentences: z.array(z.object({ text: z.string(), coverLetterItemId: z.string().nullable() })),
});
export type SentencesResult = z.infer<typeof sentencesSchema>;

// 붙여넣은 자소서는 본문 전체, 생성한 자소서는 응답이 있는 문항만 id와 함께 넘긴다(명세 08 「결정」).
export type SentencesInput = { kind: 'pasted'; body: string } | { kind: 'generated'; items: { id: string; answer: string }[] };

export function buildSentencesInput(input: SentencesInput): string {
  if (input.kind === 'pasted') return ['자기소개서:', input.body].join('\n');
  return [
    '자기소개서 문항별 응답:',
    ...input.items.flatMap((item) => [`- 문항 id: ${item.id}`, `  응답: ${item.answer}`]),
  ].join('\n');
}

// 문장 첫 질문 지시문(명세 08, R10). 면접관처럼 근거를 묻되 문장을 고쳐 쓰지 않는다(C4). 점수·평가는 말하지 않는다(R11).
export const QUESTION_SYSTEM = [
  '너는 면접관처럼 자기소개서의 주장 문장 하나에 대해 근거를 묻는다.',
  '수치라면 계산 방법·비교 기준·기간을, 행동이라면 팀이 아니라 본인이 한 일을, 평가 표현이라면 실제 수단·도구·산출물을 묻는다.',
  '질문은 하나만, 한두 문장으로 짧게 한다.',
  '문장을 고쳐 쓰거나 더 나은 표현을 제안하지 않는다. 점수나 평가를 말하지 않는다.',
].join('\n');

// 첫 질문 응답 스키마(명세 08). 빈 질문은 사용자에게 보일 것이 없으므로 스키마 밖(502)으로 본다.
export const questionSchema = z.object({ question: z.string().trim().min(1) });
export type QuestionResult = z.infer<typeof questionSchema>;

// 문장이 든 문맥(붙여넣은 자소서는 본문, 생성한 자소서는 그 문항의 질문·응답)을 함께 넘겨야 질문이 맥락에 맞는다.
export type QuestionInput = { sentence: string; context: { question?: string; text: string } };

export function buildQuestionInput(input: QuestionInput): string {
  return [
    ...(input.context.question ? [`자기소개서 문항: ${input.context.question}`] : []),
    '자기소개서 원문:',
    input.context.text,
    '',
    `점검할 주장 문장: ${input.sentence}`,
  ].join('\n');
}
