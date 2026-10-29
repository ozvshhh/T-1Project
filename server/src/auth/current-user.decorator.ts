import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export interface AuthUser {
  id: string;
  email: string;
}

export type AuthenticatedRequest = Request & { user?: AuthUser };

// 컨트롤러는 요청 본문이 아니라 가드가 검증한 토큰에서만 사용자를 얻는다(소유자 검사의 기준).
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
