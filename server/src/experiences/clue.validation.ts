import { BadRequestException } from '@nestjs/common';
import { asObject } from '../auth/signup.validation';
import { FILE_CLUE_TYPES, FileClueType } from './clue.schema';

// multer가 메모리에 받은 파일 중 단서가 쓰는 칸만 고른다(디스크 저장소를 쓰지 않으므로 path가 없다).
export type UploadedClueFile = Pick<Express.Multer.File, 'originalname' | 'mimetype' | 'size' | 'buffer'>;

export interface TextClueInput {
  type: 'text';
  text: string;
}

export interface FileClueInput {
  type: FileClueType;
  description: string | null;
  fileName: string;
  mimeType: string;
  size: number;
  data: Buffer;
}

type ClueField = 'type' | 'text' | 'file';

interface FieldError {
  field: ClueField;
  reason: string;
}

export const CLUE_REASONS: Record<ClueField, string> = {
  type: '단서 종류를 확인해 주세요.',
  text: '단서 내용을 입력해 주세요.',
  file: '올릴 파일을 선택해 주세요.',
};

export const FILE_TOO_LARGE_REASON = '파일이 너무 큽니다.';

// 프런트가 칸별로 오류를 보여 주도록 field·reason을 담아 400 VALIDATION으로 돌려준다(api.md 1절).
export function clueValidationError(details: FieldError[]): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION', message: '입력값을 확인해 주세요.', details });
}

function throwIfAny(details: FieldError[]): void {
  if (details.length > 0) throw clueValidationError(details);
}

// 공백만 있는 값은 빈 값과 같다: 내용 없는 단서는 대화·출처 근거가 될 수 없다.
function trimmed(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t === '' ? null : t;
}

// JSON 텍스트 단서: { type: "text", text }만 받는다(api.md 4절). 파일 종류를 JSON으로 보내면 파일 없이 저장되므로 막는다.
export function validateTextClue(body: unknown): TextClueInput {
  const obj = asObject(body);
  const details: FieldError[] = [];
  if (obj.type !== 'text') details.push({ field: 'type', reason: CLUE_REASONS.type });
  const text = trimmed(obj.text);
  if (text === null) details.push({ field: 'text', reason: CLUE_REASONS.text });
  throwIfAny(details);
  return { type: 'text', text: text! };
}

// multipart 파일 단서: type은 photo·award·document, file 필수, description 선택(api.md 4절).
// 형식은 api.md 11절 학생 답 전이라 제한하지 않고, 크기는 multer 한도(CLUE_MAX_BYTES)가 막는다.
export function validateFileClue(body: unknown, file: UploadedClueFile | undefined): FileClueInput {
  const obj = asObject(body);
  const details: FieldError[] = [];
  const type = obj.type;
  const isFileType = typeof type === 'string' && (FILE_CLUE_TYPES as readonly string[]).includes(type);
  if (!isFileType) details.push({ field: 'type', reason: CLUE_REASONS.type });
  if (!file) details.push({ field: 'file', reason: CLUE_REASONS.file });
  throwIfAny(details);
  return {
    type: type as FileClueType,
    description: trimmed(obj.description),
    fileName: file!.originalname,
    mimeType: file!.mimetype,
    size: file!.size,
    data: file!.buffer,
  };
}
