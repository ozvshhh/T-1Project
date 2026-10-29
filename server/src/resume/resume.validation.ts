import { BadRequestException } from '@nestjs/common';
import { asObject } from '../auth/signup.validation';

export interface DraftInput {
  title: string;
  period: string;
  summary: string;
}

type DraftField = keyof DraftInput;

interface FieldError {
  field: DraftField;
  reason: string;
}

const REASONS: Record<DraftField, string> = {
  title: '활동 이름을 입력해 주세요.',
  period: '시기는 글자로 입력해 주세요.',
  summary: '내용은 글자로 입력해 주세요.',
};

// 프런트가 칸별로 오류를 보여 주도록 field·reason을 담아 400 VALIDATION으로 돌려준다(api.md 1절).
function throwIfAny(details: FieldError[]): void {
  if (details.length > 0) {
    throw new BadRequestException({ code: 'VALIDATION', message: '입력값을 확인해 주세요.', details });
  }
}

// title은 앞뒤 공백을 뺀 뒤 비면 400: 이름 없는 초안은 확정 뒤 경험 목록에서 구분할 수 없다.
function readTitle(obj: Record<string, unknown>, details: FieldError[]): string | null {
  const t = typeof obj.title === 'string' ? obj.title.trim() : '';
  if (t === '') {
    details.push({ field: 'title', reason: REASONS.title });
    return null;
  }
  return t;
}

// period·summary는 선택 칸이라 빈 문자열도 받는다. 문자열이 아닌 값만 400으로 막는다.
function readOptional(
  obj: Record<string, unknown>,
  field: 'period' | 'summary',
  details: FieldError[],
): string | undefined {
  const value = obj[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    details.push({ field, reason: REASONS[field] });
    return undefined;
  }
  return value.trim();
}

// POST /api/resume/drafts: title 필수, 빠진 칸은 빈 문자열(api.md 4절).
export function validateCreateDraft(body: unknown): DraftInput {
  const obj = asObject(body);
  const details: FieldError[] = [];
  const title = readTitle(obj, details);
  const period = readOptional(obj, 'period', details);
  const summary = readOptional(obj, 'summary', details);
  throwIfAny(details);
  return { title: title!, period: period ?? '', summary: summary ?? '' };
}

// PATCH: 보낸 칸만 고친다. title을 보냈는데 비었으면 400(빈 이름으로 덮어쓰지 않는다).
export function validateUpdateDraft(body: unknown): Partial<DraftInput> {
  const obj = asObject(body);
  const details: FieldError[] = [];
  const update: Partial<DraftInput> = {};
  if ('title' in obj) {
    const title = readTitle(obj, details);
    if (title !== null) update.title = title;
  }
  for (const field of ['period', 'summary'] as const) {
    const value = readOptional(obj, field, details);
    if (value !== undefined) update[field] = value;
  }
  throwIfAny(details);
  return update;
}
