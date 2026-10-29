import { ConflictException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model } from 'mongoose';
import { User } from '../users/user.schema';
import { BCRYPT_ROUNDS } from './auth.config';
import { SignupInput } from './signup.validation';

const MONGO_DUPLICATE_KEY = 11000;

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
    const id = String(created._id);
    // 페이로드는 sub만 둔다: 토큰에 이메일 등 개인정보를 싣지 않는다(명세 03).
    const token = await this.jwtService.signAsync({ sub: id });
    return { token, user: { id, email: created.email } };
  }
}
