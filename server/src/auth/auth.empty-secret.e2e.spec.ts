import { Server } from 'node:http';
import * as os from 'node:os';
import { INestApplication, Logger } from '@nestjs/common';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { JwtModuleOptions, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AllExceptionsFilter } from '../common/http-exception.filter';
import { UsersModule } from '../users/users.module';
import { AuthModule } from './auth.module';

// 배포 환경에 JWT_SECRET을 빠뜨려도 앱이 떠서 계정 기능이 돌아가야 하고(주최 측은 빈 설정으로 띄운다),
// 대신 만든 임시 비밀은 로그·응답 어디에도 새면 안 된다(새면 누구나 토큰을 위조한다).
describe.each([
  ['empty string', ''],
  ['unset', undefined],
])('C3-4 JWT_SECRET %s', (_label, value) => {
  const saved = {
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
  };
  let mongod: MongoMemoryServer;
  let app: INestApplication;
  let connection: Connection;
  let secret: string;
  const logged: unknown[][] = [];
  const warnings: unknown[][] = [];
  const bodies: string[] = [];
  const spies: jest.SpyInstance[] = [];
  const http = () => request(app.getHttpServer() as Server);
  // @nestjs/jwt가 index에서 내보내지 않는 옵션 토큰 이름(jwt.constants). 실제로 쓰인 비밀을 꺼내 비교하려고 쓴다.
  const JWT_MODULE_OPTIONS = 'JWT_MODULE_OPTIONS';

  const restore = (key: keyof typeof saved) => {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  };

  // 응답 본문을 모두 모아 마지막에 비밀이 섞였는지 한 번에 본다.
  const record = (res: request.Response): request.Response => {
    bodies.push(JSON.stringify(res.body) + res.text);
    return res;
  };

  beforeAll(async () => {
    if (value === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = value;
    delete process.env.JWT_EXPIRES_IN;

    // 인스턴스·정적 Logger 출력을 모두 가로챈다(실제 출력은 막는다).
    for (const level of ['log', 'warn', 'error', 'debug', 'verbose', 'fatal'] as const) {
      const capture = (...args: unknown[]) => {
        logged.push(args);
        if (level === 'warn') warnings.push(args);
      };
      spies.push(jest.spyOn(Logger.prototype, level).mockImplementation(capture));
      spies.push(jest.spyOn(Logger, level).mockImplementation(capture));
    }

    mongod = await MongoMemoryServer.create();
    const moduleRef = await Test.createTestingModule({
      // mongodb 드라이버는 os를 동적 import()로 읽는데 jest(CommonJS vm)는 이를 막는다. 운영(node)과 무관한 테스트 전용 주입.
      imports: [
        MongooseModule.forRoot(mongod.getUri(), { runtimeAdapters: { os } }),
        UsersModule,
        AuthModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['__health'] });
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    connection = app.get<Connection>(getConnectionToken());
    await connection.model('User').syncIndexes();
    const used = app.get<JwtModuleOptions>(JWT_MODULE_OPTIONS).secret;
    secret = typeof used === 'string' ? used : '';
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await mongod?.stop();
    for (const spy of spies) spy.mockRestore();
    restore('JWT_SECRET');
    restore('JWT_EXPIRES_IN');
  });

  // 빈 비밀로 서명하면 jsonwebtoken이 던져 가입이 500이 된다. 충분히 긴 무작위 비밀이어야 추측할 수 없다.
  it('generates a non-empty random secret', () => {
    expect(secret.length).toBeGreaterThanOrEqual(32);
  });

  // 가입→로그인→me 전체가 같은 임시 비밀로 서명·검증돼야 사용자가 실제로 쓸 수 있다.
  it('signup, login and me all work', async () => {
    const email = `empty-${value === undefined ? 'unset' : 'blank'}@example.com`;
    const signup = record(
      await http().post('/api/auth/signup').send({ email, password: 'pass-1234' }),
    );
    expect(signup.status).toBe(201);
    const { token, user } = signup.body as { token: string; user: { id: string; email: string } };
    expect(typeof token).toBe('string');

    const login = record(
      await http().post('/api/auth/login').send({ email, password: 'pass-1234' }),
    );
    expect(login.status).toBe(200);

    for (const t of [token, (login.body as { token: string }).token]) {
      const me = record(await http().get('/api/auth/me').set('Authorization', `Bearer ${t}`));
      expect(me.status).toBe(200);
      expect(me.body).toEqual({ user });
    }
  });

  // 임시 비밀이 실제로 쓰이는지: 다른 비밀(빈 값 포함)로 만든 토큰은 거절돼야 한다.
  it('rejects tokens signed with any other secret', async () => {
    const { user } = (await http()
      .post('/api/auth/signup')
      .send({ email: `forge-${String(value)}@example.com`, password: 'pass-1234' })
      .expect(201)).body as { user: { id: string } };
    // 꺼낸 비밀로 서명한 토큰은 통과해야, 아래 로그·응답 검사가 진짜 비밀을 대상으로 한다는 것이 보장된다.
    const genuine = new JwtService({ secret }).sign({ sub: user.id });
    const ok = record(await http().get('/api/auth/me').set('Authorization', `Bearer ${genuine}`));
    expect(ok.status).toBe(200);

    for (const other of ['guess', 'x'.repeat(64)]) {
      const forged = new JwtService({ secret: other }).sign({ sub: user.id });
      const res = record(
        await http().get('/api/auth/me').set('Authorization', `Bearer ${forged}`),
      );
      expect(res.status).toBe(401);
      expect((res.body as { error: { code: string } }).error.code).toBe('UNAUTHENTICATED');
    }
  });

  // 운영자가 원인을 알도록 이름은 알리되, 값은 남기지 않는다.
  it('warns exactly once, naming JWT_SECRET without its value', () => {
    const secretWarnings = warnings.filter((args) => args.map(String).join(' ').includes('JWT_SECRET'));
    expect(secretWarnings).toHaveLength(1);
  });

  // 로그·응답 어디에든 비밀이 한 번이라도 찍히면 토큰 위조가 가능해진다.
  it('never writes the secret to logs or responses', () => {
    for (const args of logged) {
      for (const arg of args) {
        const text = typeof arg === 'string' ? arg : JSON.stringify(arg) ?? String(arg);
        expect(text).not.toContain(secret);
      }
    }
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) expect(body).not.toContain(secret);
  });
});
