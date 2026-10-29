import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { User } from '../users/user.schema';
import { AuthenticatedRequest } from './current-user.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';

// 모든 실패가 같은 응답이어야 토큰이 왜 거절됐는지(만료·위조·계정 삭제) 바깥에서 구분할 수 없다.
const UNAUTHENTICATED = { code: 'UNAUTHENTICATED', message: '로그인이 필요합니다.' } as const;

// 정확히 "Bearer <공백 없는 토큰>" 하나만 받는다. 다른 형식은 해석을 시도하지 않는다.
const BEARER = /^Bearer ([^\s]+)$/;

// 전역 가드: 기본으로 모든 경로를 막고 @Public()만 연다. 새 컨트롤러가 인증을 빠뜨려도 자동으로 보호된다.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = BEARER.exec(req.headers.authorization ?? '');
    if (!match) throw new UnauthorizedException(UNAUTHENTICATED);

    let sub: unknown;
    try {
      // 알고리즘을 HS256으로 고정해 alg 바꿔치기(none 등) 토큰을 받지 않는다. 만료는 verify가 검사한다.
      ({ sub } = await this.jwtService.verifyAsync<{ sub: unknown }>(match[1], {
        algorithms: ['HS256'],
      }));
    } catch {
      throw new UnauthorizedException(UNAUTHENTICATED);
    }

    // 서명이 맞아도 계정이 없으면 거절한다. 형식이 틀린 sub는 조회 오류(500) 대신 401로 끝낸다.
    if (typeof sub !== 'string' || !isValidObjectId(sub)) {
      throw new UnauthorizedException(UNAUTHENTICATED);
    }
    const user = await this.userModel.findById(sub).exec();
    if (!user) throw new UnauthorizedException(UNAUTHENTICATED);

    req.user = { id: String(user._id), email: user.email };
    return true;
  }
}
