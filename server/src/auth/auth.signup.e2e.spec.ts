import { Server } from 'node:http';
import * as os from 'node:os';
import { INestApplication } from '@nestjs/common';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AllExceptionsFilter } from '../common/http-exception.filter';
import { AuthModule } from './auth.module';

const TEST_SECRET = 'test-secret';

interface ErrorResponse {
  error: { code: string; message: string; details?: { field: string; reason: unknown }[] };
}

// 가입은 모든 기능의 입구다. 잘못된 입력이 저장되거나 평문 비밀번호가 남으면 계정 분리(R1)와 보안이 함께 무너진다.
describe('C3-1 POST /api/auth/signup', () => {
  const savedSecret = process.env.JWT_SECRET;
  let mongod: MongoMemoryServer;
  let app: INestApplication;
  let connection: Connection;
  const http = () => request(app.getHttpServer() as Server);
  const users = () => connection.collection('users');

  beforeAll(async () => {
    process.env.JWT_SECRET = TEST_SECRET;
    mongod = await MongoMemoryServer.create();
    const moduleRef = await Test.createTestingModule({
      // mongodb 드라이버는 os를 동적 import()로 읽는데 jest(CommonJS vm)는 이를 막는다. 운영(node)과 무관한 테스트 전용 주입.
      imports: [
        MongooseModule.forRoot(mongod.getUri(), { runtimeAdapters: { os } }),
        AuthModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    // 운영 createApp과 같은 prefix·오류 형식을 적용해 실제 경로·본문을 검증한다.
    app.setGlobalPrefix('api', { exclude: ['__health'] });
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    connection = app.get<Connection>(getConnectionToken());
    // unique index가 만들어진 뒤에야 중복 가입 경쟁을 DB가 막는다.
    await connection.model('User').syncIndexes();
  }, 120_000);

  afterEach(async () => {
    await users().deleteMany({});
  });

  afterAll(async () => {
    await app?.close();
    await mongod?.stop();
    process.env.JWT_SECRET = savedSecret;
  });

  // 프런트는 가입 직후 받은 토큰으로 바로 로그인 상태가 된다. 토큰의 sub가 user.id여야 이후 소유자 검사가 맞는다.
  it('returns 201 with a token whose sub is user.id and user {id,email} only', async () => {
    const res = await http()
      .post('/api/auth/signup')
      .send({ email: 'new@example.com', password: 'pass-1234' });

    expect(res.status).toBe(201);
    const body = res.body as { token: unknown; user: Record<string, unknown> };
    expect(typeof body.token).toBe('string');
    expect(Object.keys(body.user).sort()).toEqual(['email', 'id']);
    expect(body.user.email).toBe('new@example.com');
    const payload = new JwtService({ secret: TEST_SECRET }).verify<{ sub: string }>(
      body.token as string,
    );
    expect(payload.sub).toBe(body.user.id);
  });

  // 대소문자·공백만 다른 이메일이 다른 계정으로 저장되면 로그인할 때 계정을 찾지 못한다.
  it('stores the email trimmed and lowercased', async () => {
    const res = await http()
      .post('/api/auth/signup')
      .send({ email: ' A@B.com ', password: 'pass-1234' });

    expect(res.status).toBe(201);
    expect((res.body as { user: { email: string } }).user.email).toBe('a@b.com');
    const doc = await users().findOne({});
    expect(doc?.email).toBe('a@b.com');
  });

  // 프런트가 어느 칸을 고칠지 보여 주려면 400 VALIDATION과 field가 함께 와야 한다.
  it.each([
    ['missing', { password: 'pass-1234' }],
    ['empty', { email: '', password: 'pass-1234' }],
    ['blank', { email: '   ', password: 'pass-1234' }],
    ['not an email', { email: 'not-an-email', password: 'pass-1234' }],
    ['not a string', { email: 123, password: 'pass-1234' }],
  ])('rejects email %s with 400 VALIDATION', async (_label, payload) => {
    const res = await http().post('/api/auth/signup').send(payload);

    expect(res.status).toBe(400);
    const { error } = res.body as ErrorResponse;
    expect(error.code).toBe('VALIDATION');
    expect(error.details).toEqual(
      expect.arrayContaining([{ field: 'email', reason: expect.any(String) as unknown }]),
    );
    expect(await users().countDocuments()).toBe(0);
  });

  // bcrypt는 72바이트 뒤를 버린다. 넘는 비밀번호를 받으면 앞 72바이트만 같아도 로그인되는 구멍이 생긴다.
  it.each([
    ['missing', { email: 'p@example.com' }],
    ['empty', { email: 'p@example.com', password: '' }],
    ['73 ASCII bytes', { email: 'p@example.com', password: 'a'.repeat(73) }],
    ['75 UTF-8 bytes (25 Korean chars)', { email: 'p@example.com', password: '가'.repeat(25) }],
  ])('rejects password %s with 400 VALIDATION', async (_label, payload) => {
    const res = await http().post('/api/auth/signup').send(payload);

    expect(res.status).toBe(400);
    const { error } = res.body as ErrorResponse;
    expect(error.code).toBe('VALIDATION');
    expect(error.details).toEqual(
      expect.arrayContaining([{ field: 'password', reason: expect.any(String) as unknown }]),
    );
    expect(await users().countDocuments()).toBe(0);
  });

  // 경계값: 정확히 72바이트는 bcrypt가 온전히 쓰므로 받아야 한다.
  it('accepts a password of exactly 72 bytes', async () => {
    const res = await http()
      .post('/api/auth/signup')
      .send({ email: 'edge@example.com', password: 'a'.repeat(72) });
    expect(res.status).toBe(201);
  });

  // 같은 사람이 두 계정을 갖게 되면 데이터가 갈라진다. 정규화 뒤 같은 이메일은 409로 막는다.
  it('returns 409 EMAIL_TAKEN for an existing email differing only in case/whitespace', async () => {
    await http().post('/api/auth/signup').send({ email: 'a@b.com', password: 'pass-1234' }).expect(201);

    const res = await http()
      .post('/api/auth/signup')
      .send({ email: ' A@B.COM ', password: 'other-pass' });

    expect(res.status).toBe(409);
    expect((res.body as ErrorResponse).error.code).toBe('EMAIL_TAKEN');
    expect(await users().countDocuments()).toBe(1);
  });

  // 평문이 응답이나 DB에 남으면 로그·백업 유출만으로 계정이 털린다.
  it('never exposes the plain password in the response or the DB document', async () => {
    const password = 'Very-Secret-Plain-77';
    const res = await http().post('/api/auth/signup').send({ email: 'sec@example.com', password });

    expect(res.status).toBe(201);
    expect(JSON.stringify(res.body)).not.toContain(password);
    expect(JSON.stringify(res.headers)).not.toContain(password);

    const doc = await users().findOne({ email: 'sec@example.com' });
    expect(doc).not.toBeNull();
    expect(JSON.stringify(doc)).not.toContain(password);
    await expect(bcrypt.compare(password, doc?.passwordHash as string)).resolves.toBe(true);
  });
});
