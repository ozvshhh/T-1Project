import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SeedService } from './seed.service';
import { User, UserSchema } from './user.schema';

// users 컬렉션 모델과 기동 시 시드를 한곳에 둔다. 인증 모듈이 이 모델을 다시 쓴다.
@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  providers: [SeedService],
  exports: [MongooseModule],
})
export class UsersModule {}
