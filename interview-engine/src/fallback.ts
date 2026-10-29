import type { CheckField, InterviewerId } from './types.js';

export interface FallbackTemplate {
  purpose: string;
  fields: CheckField[];
  text: string;
}

/**
 * AI 질문 생성이 실패했을 때 쓰는 기본 질문.
 * 사용자의 경험을 전제하지 않도록 일반적으로 썼다. 문구는 팀이 다듬는다.
 */
export const FALLBACK_QUESTIONS: Record<InterviewerId, FallbackTemplate[]> = {
  practical: [
    {
      purpose: '본인 기여와 문제 해결 과정',
      fields: ['contribution', 'process'],
      text: '자소서에 쓴 경험 중 하나를 골라, 그중 본인이 직접 맡은 부분과 진행 과정을 설명해 주세요.',
    },
    {
      purpose: '선택 이유와 검증 방법',
      fields: ['reason', 'verification'],
      text: '그 경험에서 방법을 정할 때 무엇을 기준으로 골랐는지, 결과는 어떻게 확인했는지 말씀해 주세요.',
    },
  ],
  executive: [
    {
      purpose: '협업 과정',
      fields: ['collaboration'],
      text: '여러 사람과 함께 일하면서 의견을 맞춰야 했던 상황이 있었다면, 그때 어떻게 진행했는지 말씀해 주세요.',
    },
    {
      purpose: '책임 있는 판단과 실패 이후 행동',
      fields: ['judgment', 'after_failure'],
      text: '스스로 판단해서 결정해야 했던 일이나 계획대로 되지 않았던 일이 있었다면, 그 뒤에 어떻게 했는지 말씀해 주세요.',
    },
  ],
};
