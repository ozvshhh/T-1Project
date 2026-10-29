import { z } from 'zod';

// 이력서 활동 나누기 지시문(명세 10). 글에 없는 활동·역할·수치가 초안에 섞이면 사용자가 하지 않은 경험이 카드·자소서로 이어진다(C1).
export const RESUME_SPLIT_SYSTEM = [
  '너는 취업 준비생이 붙여넣은 이력서 글을 활동 단위로 나눈다.',
  '글에 실제로 있는 활동만 나눈다. 글에 없는 활동·역할·수치를 지어내지 않는다.',
  '제목(title)과 시기(period)는 글에 쓰인 대로 옮긴다. 시기가 글에 없으면 빈 문자열로 둔다.',
  '내용(summary)은 그 활동에 해당하는 원문 부분을 그대로 옮긴다.',
  '나눌 활동이 없으면 빈 목록을 돌려준다.',
].join('\n');

// 응답 스키마(명세 10). Gateway strict json_schema는 모든 칸이 required여야 하므로 optional을 두지 않는다.
// 빈 제목·중복 제목은 스키마가 아니라 서버(ResumeService)가 걸러 낸다.
export const resumeSplitSchema = z.object({
  activities: z.array(z.object({ title: z.string(), period: z.string(), summary: z.string() })),
});
export type ResumeSplitResult = z.infer<typeof resumeSplitSchema>;

// 입력은 붙여넣은 글 전체뿐이다: 다른 데이터를 넣지 않아야 AI가 글 밖의 활동을 끌어오지 않는다.
export function buildResumeSplitInput(text: string): string {
  return ['이력서 글:', text].join('\n');
}
