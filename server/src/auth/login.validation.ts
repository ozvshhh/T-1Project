import { asObject, FieldError, normalizeEmail, throwValidation } from './signup.validation';

export interface LoginInput {
  email: string;
  password: string;
}

// 로그인은 형식·길이 규칙을 다시 따지지 않는다: 규칙에 안 맞는 값은 어차피 저장된 계정과 일치하지 않아 401로 끝난다.
// 다만 값 자체가 없으면 자격 증명 문제가 아니라 입력 문제이므로 400 VALIDATION으로 칸을 짚어 준다(api.md 1절).
export function validateLogin(body: unknown): LoginInput {
  const obj = asObject(body);
  const details: FieldError[] = [];

  const email = normalizeEmail(obj.email);
  if (email === '') {
    details.push({ field: 'email', reason: '이메일을 입력해 주세요.' });
  }

  const password = typeof obj.password === 'string' ? obj.password : '';
  if (password === '') {
    details.push({ field: 'password', reason: '비밀번호를 입력해 주세요.' });
  }

  throwValidation(details);
  return { email, password };
}
