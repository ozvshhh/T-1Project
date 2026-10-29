import { BadRequestException } from '@nestjs/common';
import { PASSWORD_MAX_BYTES } from './auth.config';

export interface SignupInput {
  email: string;
  password: string;
}

interface FieldError {
  field: 'email' | 'password';
  reason: string;
}

// 로컬@도메인.최상위 형태만 본다. 실제 존재 여부는 확인하지 않는다.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 프런트가 칸별로 오류를 보여 주도록 400 VALIDATION에 field·reason을 모두 담는다(api.md 1절).
export function validateSignup(body: unknown): SignupInput {
  const obj = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const details: FieldError[] = [];

  const email = typeof obj.email === 'string' ? obj.email.trim().toLowerCase() : '';
  if (typeof obj.email !== 'string' || email === '') {
    details.push({ field: 'email', reason: '이메일을 입력해 주세요.' });
  } else if (!EMAIL_PATTERN.test(email)) {
    details.push({ field: 'email', reason: '이메일 형식이 아닙니다.' });
  }

  const password = typeof obj.password === 'string' ? obj.password : '';
  if (password === '') {
    details.push({ field: 'password', reason: '비밀번호를 입력해 주세요.' });
  } else if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    details.push({
      field: 'password',
      reason: `비밀번호는 ${PASSWORD_MAX_BYTES}바이트 이하여야 합니다.`,
    });
  }

  if (details.length > 0) {
    throw new BadRequestException({ code: 'VALIDATION', message: '입력값을 확인해 주세요.', details });
  }
  return { email, password };
}
