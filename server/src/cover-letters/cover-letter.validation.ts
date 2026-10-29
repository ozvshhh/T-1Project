import { BadRequestException } from '@nestjs/common';
import { asObject } from '../auth/signup.validation';

export interface CreateCoverLetterInput {
  title: string | null;
  body: string;
}

export interface UpdateCoverLetterInput {
  title?: string | null;
  body?: string;
}

type CoverLetterField = 'title' | 'body';

interface FieldError {
  field: CoverLetterField;
  reason: string;
}

export const COVER_LETTER_REASONS = {
  title: '제목은 글자로 입력해 주세요.',
  body: '자기소개서 내용을 입력해 주세요.',
  generatedBody: '생성한 자기소개서는 문항별 응답으로 고쳐 주세요.',
} as const;

// 프런트가 칸별로 오류를 보여 주도록 field·reason을 담아 400 VALIDATION으로 돌려준다(api.md 1절).
export function coverLetterValidationError(details: FieldError[]): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION', message: '입력값을 확인해 주세요.', details });
}

// 붙여넣은 글은 줄바꿈·들여쓰기가 점검 문장 위치에 쓰이므로 그대로 저장하고, 공백만 있으면 빈 글로 본다.
function readBody(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  return value;
}

// 제목은 선택이다: 없거나 공백만이면 null(제목 없음). 문자열이 아니면 잘못된 입력.
function readTitle(value: unknown): { ok: true; title: string | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, title: null };
  if (typeof value !== 'string') return { ok: false };
  const t = value.trim();
  return { ok: true, title: t === '' ? null : t };
}

// POST: body 필수, title 선택(api.md 7절).
export function validateCreateCoverLetter(raw: unknown): CreateCoverLetterInput {
  const obj = asObject(raw);
  const details: FieldError[] = [];
  const title = readTitle(obj.title);
  const body = readBody(obj.body);
  if (!title.ok) details.push({ field: 'title', reason: COVER_LETTER_REASONS.title });
  if (body === null) details.push({ field: 'body', reason: COVER_LETTER_REASONS.body });
  if (details.length > 0) throw coverLetterValidationError(details);
  return { title: title.ok ? title.title : null, body: body! };
}

// PATCH: 보낸 칸만 고친다. 보낸 body가 비었으면 400(빈 글로 덮어쓰지 않는다).
export function validateUpdateCoverLetter(raw: unknown): UpdateCoverLetterInput {
  const obj = asObject(raw);
  const details: FieldError[] = [];
  const update: UpdateCoverLetterInput = {};
  if ('title' in obj) {
    const title = readTitle(obj.title);
    if (title.ok) update.title = title.title;
    else details.push({ field: 'title', reason: COVER_LETTER_REASONS.title });
  }
  if ('body' in obj) {
    const body = readBody(obj.body);
    if (body === null) details.push({ field: 'body', reason: COVER_LETTER_REASONS.body });
    else update.body = body;
  }
  if (details.length > 0) throw coverLetterValidationError(details);
  return update;
}
