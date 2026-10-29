import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model } from 'mongoose';
import { BCRYPT_ROUNDS } from '../auth/auth.config';
import { User } from './user.schema';

const MONGO_DUPLICATE_KEY = 11000;

// 주최 측은 빈 DB에서 앱을 띄운 뒤 SEED_USER_EMAIL/SEED_USER_PASSWORD로 바로 로그인하므로 기동 시 계정을 보장한다.
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(@InjectModel(User.name) private readonly userModel: Model<User>) {}

  async onApplicationBootstrap(): Promise<void> {
    const email = process.env.SEED_USER_EMAIL?.trim().toLowerCase();
    const password = process.env.SEED_USER_PASSWORD;
    if (!email || !password) {
      this.logger.warn('SEED_USER_EMAIL 또는 SEED_USER_PASSWORD가 비어 시드 사용자를 만들지 않습니다.');
      return;
    }

    if (await this.userModel.findOne({ email }).exec()) {
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    try {
      await this.userModel.create({ email, passwordHash, role: '취준생' });
      this.logger.log('시드 사용자를 만들었습니다.');
    } catch (error) {
      // 다른 인스턴스가 먼저 만든 경우(unique 인덱스 충돌)는 이미 시드된 것이다.
      if ((error as { code?: number }).code === MONGO_DUPLICATE_KEY) {
        return;
      }
      throw error;
    }
  }
}
