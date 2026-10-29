import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/user.schema';
import { DEFAULT_JWT_EXPIRES_IN } from './auth.config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

// 비밀·만료는 환경변수에서 읽는다(코드에 박으면 배포마다 같은 비밀이 된다). 빈 비밀 처리는 C3-4 범위.
function jwtOptionsFromEnv(): JwtModuleOptions {
  return {
    secret: process.env.JWT_SECRET,
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
