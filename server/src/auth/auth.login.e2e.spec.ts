import { Server } from 'node:http';
import * as os from 'node:os';
import { INestApplication } from '@nestjs/common';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AllExceptionsFilter } from '../common/http-exception.filter';
import { UsersModule } from '../users/users.module';
import { AuthModule } from './auth.module';

const TEST_SECRET = 'test-secret';
// 대문자·앞뒤 공백이 섞인 시드 이메일: 시드가 정규화해 저장하므로 정규화된 이메일로 로그인돼야 한다.
const SEED_EMAIL_RAW = '  Seed.User@Example.COM ';
const SEED_EMAIL = 'seed.user@example.com';
const SEED_PASSWORD = 'seed-pass-1234';

interface ErrorResponse {
  error: { code: string; message: string; details?: { field: string; reason: unknown }[] };
}

// 주최 측은 빈 DB에서 시드 계정으로 바로 로그인한다. 로그인이 막히면 이후 모든 기능 검증이 멈춘다.
describe('C3-2 POST /api/auth/login', () => {
  const saved = {
    JWT_SECRET: process.env.JWT_SECRET,
    SEED_USER_EMAIL: process.env.SEED_USER_EMAIL,
    SEED_USER_PASSWORD: process.env.SEED_USER_PASSWORD,
  };
  let mongod: MongoMemoryServer;
  let app: INestApplication;
  let connection: Connection;
  const http = () => request(app.getHttpServer() as Server);
  const users = () => connection.collection('users');

  const restore = (key: keyof typeof saved) => {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = TEST_SECRET;
    process.env.SEED_USER_EMAIL = SEED_EMAIL_RAW;
    process.env.SEED_USER_PASSWORD = SEED_PASSWORD;
    mongod = await MongoMemoryServer.create();
    const moduleRef = await Test.createTestingModule({
      // mongodb 드라이버는 os를 동적 import()로 읽는데 jest(CommonJS vm)는 이를 막는다. 운영(node)과 무관한 테스트 전용 주입.
      imports: [
        MongooseModule.forRoot(mongod.getUri(), { runtimeAdapters: { os } }),
        UsersModule,
        AuthModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    // 운영 createApp과 같은 prefix·오류 형식을 적용해 실제 경로·본문을 검증한다.
    app.setGlobalPrefix('api', { exclude: ['__health'] });
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    connection = app.get<Connection>(getConnectionToken());
    await connection.model('User').syncIndexes();
  }, 120_000);

  afterEach(async () => {
    // 시드 계정은 남기고 테스트가 만든 계정만 지운다.
    await users().deleteMany({ email: { $ne: SEED_EMAIL } });
  });

  afterAll(async () => {
    await app?.close();
    await mongod?.stop();
    restore('JWT_SECRET');
    restore('SEED_USER_EMAIL');
    restore('SEED_USER_PASSWORD');
  });

  // 토큰의 sub가 user.id여야 이후 소유자 검사가 맞고, role·passwordHash가 응답에 새지 않아야 한다.
  it('logs in the seed account with 200 {token, user:{id,email}}', async () => {
    const res = await http()
      .post('/api/auth/login')
      .send({ email: SEED_EMAIL, password: SEED_PASSWORD });

    expect(res.status).toBe(200);
    const body = res.body as { token: unknown; user: Record<string, unknown> };
    expect(typeof body.token).toBe('string');
    expect((body.token as string).length).toBeGreaterThan(0);
    expect(Object.keys(body.user).sort()).toEqual(['email', 'id']);
    expect(body.user.email).toBe(SEED_EMAIL);
    const payload = new JwtService({ secret: TEST_SECRET }).verify<{ sub: string }>(
      body.token as string,
    );
    expect(payload.sub).toBe(body.user.id);
  });

  // 가입할 때와 대소문자·공백만 다르게 입력해도 같은 계정으로 들어가야 한다.
  it('logs in a signed-up account with an email differing only in case/whitespace', async () => {
    const signup = await http()
      .post('/api/auth/signup')
      .send({ email: 'mixed@example.com', password: 'pass-1234' })
      .expect(201);

    const res = await http()
      .post('/api/auth/login')
      .send({ email: '  MIXED@Example.com ', password: 'pass-1234' });

    expect(res.status).toBe(200);
    const body = res.body as { user: { id: string; email: string } };
    expect(body.user).toEqual((signup.body as { user: unknown }).user);
  });

  // 두 응답이 다르면 이메일 가입 여부를 알아낼 수 있다(계정 열거). code·message가 모두 같아야 한다.
  it('returns the same 401 INVALID_CREDENTIALS for a wrong password and an unknown email', async () => {
    const wrongPassword = await http()
      .post('/api/auth/login')
      .send({ email: SEED_EMAIL, password: 'wrong-pass' });
    const unknownEmail = await http()
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: SEED_PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    const a = (wrongPassword.body as ErrorResponse).error;
    const b = (unknownEmail.body as ErrorResponse).error;
    expect(a.code).toBe('INVALID_CREDENTIALS');
    expect(b.code).toBe('INVALID_CREDENTIALS');
    expect(a).toEqual(b);
  });

  // 형식이 틀린 요청은 자격 증명 문제가 아니라 입력 문제다. 프런트가 칸을 짚을 수 있게 400 VALIDATION으로 답한다.
  it.each([
    ['email missing', { password: 'pass-1234' }, 'email'],
    ['email empty', { email: '  ', password: 'pass-1234' }, 'email'],
    ['email not a string', { email: 123, password: 'pass-1234' }, 'email'],
    ['password missing', { email: SEED_EMAIL }, 'password'],
    ['password empty', { email: SEED_EMAIL, password: '' }, 'password'],
    ['password not a string', { email: SEED_EMAIL, password: 1234 }, 'password'],
  ])('rejects %s with 400 VALIDATION', async (_label, payload, field) => {
    const res = await http().post('/api/auth/login').send(payload);

    expect(res.status).toBe(400);
    const { error } = res.body as ErrorResponse;
    expect(error.code).toBe('VALIDATION');
    expect(error.details).toEqual(
      expect.arrayContaining([{ field, reason: expect.any(String) as unknown }]),
    );
  });
});
