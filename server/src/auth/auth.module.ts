import { randomBytes } from 'node:crypto';
import { Logger, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/user.schema';
import { DEFAULT_JWT_EXPIRES_IN, GENERATED_JWT_SECRET_BYTES } from './auth.config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

// 비밀이 비어도 앱은 떠야 한다(주최 측은 빈 설정으로 띄운다). 대신 무작위 비밀을 쓰고, 값은 로그에 남기지 않는다.
function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret) return secret;
  new Logger('AuthModule').warn(
    'JWT_SECRET이 비어 있어 임시 비밀을 만들었습니다. 재시작하면 기존 토큰은 무효가 됩니다.',
  );
  return randomBytes(GENERATED_JWT_SECRET_BYTES).toString('hex');
}

// 비밀·만료는 환경변수에서 읽는다(코드에 박으면 배포마다 같은 비밀이 된다).
// 팩토리는 모듈 생성 때 한 번만 돌아 sign과 verify가 같은 비밀을 쓴다.
function jwtOptionsFromEnv(): JwtModuleOptions {
  return {
    secret: resolveJwtSecret(),
    signOptions: {
      algorithm: 'HS256',
      expiresIn: (process.env.JWT_EXPIRES_IN ||
        DEFAULT_JWT_EXPIRES_IN) as NonNullable<JwtModuleOptions['signOptions']>['expiresIn'],
    },
  };
}

// 계정 API. users 모델은 seed와 같은 스키마를 쓴다(시드 계정으로도 로그인돼야 한다).
@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    JwtModule.registerAsync({ useFactory: jwtOptionsFromEnv }),
  ],
  controllers: [AuthController],
  // APP_GUARD로 등록해 이 모듈을 가져온 앱의 모든 경로에 인증을 기본 적용한다(@Public()만 예외).
  providers: [AuthService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AuthModule {}
