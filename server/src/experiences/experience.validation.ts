import { BadRequestException } from '@nestjs/common';
import { asObject } from '../auth/signup.validation';

export interface ExperienceInput {
  title: string;
  period: string;
}

type ExperienceField = keyof ExperienceInput;

interface FieldError {
  field: ExperienceField;
  reason: string;
}

const REASONS: Record<ExperienceField, string> = {
  title: '경험 제목을 입력해 주세요.',
  period: '대략적인 시기를 입력해 주세요.',
};

// 공백만 있는 값은 빈 값과 같다: 이름 없는 카드는 목록에서 구분할 수 없다.
function trimmed(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t === '' ? null : t;
}

// 프런트가 칸별로 오류를 보여 주도록 field·reason을 담아 400 VALIDATION으로 돌려준다(api.md 1절).
function throwIfAny(details: FieldError[]): void {
  if (details.length > 0) {
    throw new BadRequestException({ code: 'VALIDATION', message: '입력값을 확인해 주세요.', details });
  }
}

// POST: title·period 둘 다 필수(api.md 4절).
export function validateCreateExperience(body: unknown): ExperienceInput {
  const obj = asObject(body);
  const details: FieldError[] = [];
  const title = trimmed(obj.title);
  const period = trimmed(obj.period);
  if (title === null) details.push({ field: 'title', reason: REASONS.title });
  if (period === null) details.push({ field: 'period', reason: REASONS.period });
  throwIfAny(details);
  return { title: title!, period: period! };
}

// PATCH: 보낸 칸만 고친다. 보낸 칸이 비었거나 문자열이 아니면 400(빈 값으로 덮어쓰지 않는다).
export function validateUpdateExperience(body: unknown): Partial<ExperienceInput> {
  const obj = asObject(body);
  const details: FieldError[] = [];
  const update: Partial<ExperienceInput> = {};
  for (const field of ['title', 'period'] as const) {
    if (!(field in obj)) continue;
    const value = trimmed(obj[field]);
    if (value === null) details.push({ field, reason: REASONS[field] });
    else update[field] = value;
  }
  throwIfAny(details);
  return update;
}
