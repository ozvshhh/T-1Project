import { Server } from 'node:http';
import * as os from 'node:os';
import { Controller, Get, INestApplication } from '@nestjs/common';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection, Types } from 'mongoose';
import request from 'supertest';
import { AllExceptionsFilter } from '../common/http-exception.filter';
import { HealthModule } from '../health/health.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from './auth.module';

const TEST_SECRET = 'test-secret';

interface ErrorResponse {
  error: { code: string; message: string };
}

// @Public() 없이 새로 붙인 컨트롤러: 전역 가드라면 아무 표시 없이도 토큰을 요구해야 한다.
@Controller('guard-probe')
class ProbeController {
  @Get()
  get(): { ok: boolean } {
    return { ok: true };
  }
}

// 이후 모든 기능 API가 이 가드에 기대므로, 위조·만료·삭제된 계정 토큰이 하나라도 통과하면 계정 분리(R1)가 깨진다.
describe('C3-3 GET /api/auth/me and global JWT guard', () => {
  const saved = {
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
  };
  let mongod: MongoMemoryServer;
  const apps: INestApplication[] = [];
  let app: INestApplication;
  let connection: Connection;
  const http = (target: INestApplication = app) => request(target.getHttpServer() as Server);

  const restore = (key: keyof typeof saved) => {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  };

  // 운영 createApp과 같은 prefix·오류 형식으로 띄워 실제 경로·본문을 검증한다.
  async function buildApp(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      // mongodb 드라이버는 os를 동적 import()로 읽는데 jest(CommonJS vm)는 이를 막는다. 운영(node)과 무관한 테스트 전용 주입.
      imports: [
        MongooseModule.forRoot(mongod.getUri(), { runtimeAdapters: { os } }),
        UsersModule,
        AuthModule,
        HealthModule,
      ],
      controllers: [ProbeController],
    }).compile();
    const created = moduleRef.createNestApplication({ logger: false });
    created.setGlobalPrefix('api', { exclude: ['__health'] });
    created.useGlobalFilters(new AllExceptionsFilter());
    await created.init();
    apps.push(created);
    return created;
  }

  async function signup(
    email: string,
    target: INestApplication = app,
  ): Promise<{ token: string; user: { id: string; email: string } }> {
    const res = await http(target)
      .post('/api/auth/signup')
      .send({ email, password: 'pass-1234' })
      .expect(201);
    return res.body as { token: string; user: { id: string; email: string } };
  }

  const expectUnauthenticated = (res: request.Response) => {
    expect(res.status).toBe(401);
    expect((res.body as ErrorResponse).error.code).toBe('UNAUTHENTICATED');
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = TEST_SECRET;
    delete process.env.JWT_EXPIRES_IN;
    mongod = await MongoMemoryServer.create();
    app = await buildApp();
    connection = app.get<Connection>(getConnectionToken());
    await connection.model('User').syncIndexes();
  }, 120_000);

  afterEach(async () => {
    await connection.collection('users').deleteMany({});
  });

  afterAll(async () => {
    for (const a of apps) await a.close();
    await mongod?.stop();
    restore('JWT_SECRET');
    restore('JWT_EXPIRES_IN');
  });

  // 새로고침 뒤 로그인 상태 복원용: 키가 정확히 id·email이어야 role·passwordHash가 새지 않는다.
  it('returns 200 {user:{id,email}} for a valid token', async () => {
    const { token, user } = await signup('me@example.com');

    const res = await http().get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as { user: Record<string, unknown> };
    expect(Object.keys(body)).toEqual(['user']);
    expect(Object.keys(body.user).sort()).toEqual(['email', 'id']);
    expect(body.user).toEqual(user);
  });

  // 헤더가 없거나 형식이 틀리면 토큰을 해석하지 않고 바로 거절해야 한다.
  it.each([
    ['no Authorization header', undefined],
    ['non-Bearer scheme', 'Token abc'],
    ['empty Bearer value', 'Bearer '],
    ['Bearer without space', 'Bearerabc'],
  ])('rejects %s with 401 UNAUTHENTICATED', async (_label, header) => {
    const req = http().get('/api/auth/me');
    if (header !== undefined) req.set('Authorization', header);
    expectUnauthenticated(await req);
  });

  // 서명 한 글자만 바꿔도 거절해야 토큰을 손으로 고쳐 남의 계정에 들어갈 수 없다.
  it('rejects a token with a tampered signature', async () => {
    const { token } = await signup('tamper@example.com');
    const last = token.slice(-1);
    const tampered = token.slice(0, -1) + (last === 'A' ? 'B' : 'A');

    expectUnauthenticated(
      await http().get('/api/auth/me').set('Authorization', `Bearer ${tampered}`),
    );
  });

  // 다른 비밀로 만든 토큰을 받으면 비밀을 모르는 누구나 sub를 골라 로그인할 수 있다.
  it('rejects a token signed with another secret', async () => {
    const { user } = await signup('other@example.com');
    const forged = new JwtService({ secret: 'other-secret' }).sign({ sub: user.id });

    expectUnauthenticated(
      await http().get('/api/auth/me').set('Authorization', `Bearer ${forged}`),
    );
  });

  // 서명이 맞아도 계정이 지워졌으면 그 토큰으로 자원에 접근하면 안 된다.
  it('rejects a valid token whose user was deleted', async () => {
    const { token, user } = await signup('gone@example.com');
    await connection.collection('users').deleteOne({ _id: new Types.ObjectId(user.id) });

    expectUnauthenticated(await http().get('/api/auth/me').set('Authorization', `Bearer ${token}`));
  });

  // sub가 ObjectId 형식이 아니어도 500이 아니라 401이어야 한다(조회 오류가 새면 안 된다).
  it('rejects a correctly signed token with a malformed sub', async () => {
    const odd = new JwtService({ secret: TEST_SECRET }).sign({ sub: 'not-an-object-id' });

    expectUnauthenticated(await http().get('/api/auth/me').set('Authorization', `Bearer ${odd}`));
  });

  // 만료는 실제 설정 경로(JWT_EXPIRES_IN)로 발급한 토큰으로 확인해야 운영에서도 만료가 지켜진다.
  it('rejects a token that expired under a short JWT_EXPIRES_IN', async () => {
    // 1s면 느린 CI에서 가입(bcrypt) 사이에 이미 만료돼 「발급 직후 200」이 가끔 실패했다. 여유를 두고 3s.
    process.env.JWT_EXPIRES_IN = '3s';
    let shortApp: INestApplication;
    try {
      shortApp = await buildApp();
    } finally {
      delete process.env.JWT_EXPIRES_IN;
    }
    const { token } = await signup('expire@example.com', shortApp);
    // 발급 직후에는 통과해야 거절 이유가 만료임을 보장한다.
    await http(shortApp).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(200);

    // exp는 초 단위라 경계를 확실히 넘도록 4.1초 기다린다.
    await new Promise((resolve) => setTimeout(resolve, 4100));

    expectUnauthenticated(
      await http(shortApp).get('/api/auth/me').set('Authorization', `Bearer ${token}`),
    );
  }, 15_000);

  // 새 컨트롤러가 @Public() 없이도 자동으로 막혀야, 기능을 추가할 때 인증을 빠뜨리는 실수가 없다.
  it('protects a new controller without @Public() automatically', async () => {
    expectUnauthenticated(await http().get('/api/guard-probe'));

    const { token } = await signup('probe@example.com');
    const res = await http().get('/api/guard-probe').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  // 주최 측 검사는 토큰 없이 /__health를 본다. 가드가 막으면 배포 확인 자체가 실패한다.
  it('serves /__health without a token', async () => {
    const res = await http().get('/__health');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  // 가입·로그인은 토큰을 받기 위한 입구라 토큰 없이 열려 있어야 한다.
  it('keeps signup and login public', async () => {
    await signup('public@example.com');
    await http()
      .post('/api/auth/login')
      .send({ email: 'public@example.com', password: 'pass-1234' })
      .expect(200);
  });
});
