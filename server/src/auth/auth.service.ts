import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model } from 'mongoose';
import { User } from '../users/user.schema';
import { BCRYPT_ROUNDS } from './auth.config';
import { LoginInput } from './login.validation';
import { SignupInput } from './signup.validation';

const MONGO_DUPLICATE_KEY = 11000;

// 두 실패 경로가 이 한 값을 함께 써서 응답이 글자 하나도 달라지지 않게 한다.
const INVALID_CREDENTIALS = {
  code: 'INVALID_CREDENTIALS',
  message: '이메일 또는 비밀번호가 올바르지 않습니다.',
} as const;

export interface AuthResult {
  token: string;
  user: { id: string; email: string };
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly jwtService: JwtService,
  ) {}

  // 평문 비밀번호는 해시에만 쓰고 저장·응답하지 않는다. role 등 내부 필드는 응답에서 뺀다(api.md user = {id,email}).
  async signup({ email, password }: SignupInput): Promise<AuthResult> {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    let created;
    try {
      created = await this.userModel.create({ email, passwordHash, role: '취준생' });
    } catch (error) {
      // 사전 조회만으로는 동시 가입 경쟁이 남으므로 unique index 충돌로 중복을 판정한다.
      if ((error as { code?: number }).code === MONGO_DUPLICATE_KEY) {
        throw new ConflictException({ code: 'EMAIL_TAKEN', message: '이미 가입된 이메일입니다.' });
      }
      throw error;
    }
    return this.issue(String(created._id), created.email);
  }

  // 없는 이메일과 틀린 비밀번호가 같은 오류를 내야 가입 여부를 알아낼 수 없다(계정 열거 방지).
  async login({ email, password }: LoginInput): Promise<AuthResult> {
    const user = await this.userModel.findOne({ email }).exec();
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    return this.issue(String(user._id), user.email);
  }

  private async issue(id: string, email: string): Promise<AuthResult> {
    // 페이로드는 sub만 둔다: 토큰에 이메일 등 개인정보를 싣지 않는다(명세 03).
    const token = await this.jwtService.signAsync({ sub: id });
    return { token, user: { id, email } };
  }
}
