import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { SeedService } from './seed.service';
import { User } from './user.schema';

const SEED_EMAIL = 'seeker@example.com';
const SEED_PASSWORD = 'loopthon-2026';

describe('C1-6 seed user', () => {
  const savedEnv = { ...process.env };
  let findOneExec: jest.Mock;
  let create: jest.Mock;
  let userModel: { findOne: jest.Mock; create: jest.Mock };

  const buildService = async (): Promise<SeedService> => {
    const moduleRef = await Test.createTestingModule({
      providers: [SeedService, { provide: getModelToken(User.name), useValue: userModel }],
    }).compile();
    return moduleRef.get(SeedService);
  };

  beforeEach(() => {
    process.env.SEED_USER_EMAIL = SEED_EMAIL;
    process.env.SEED_USER_PASSWORD = SEED_PASSWORD;
    findOneExec = jest.fn().mockResolvedValue(null);
    create = jest.fn().mockResolvedValue({});
    userModel = { findOne: jest.fn(() => ({ exec: findOneExec })), create };
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  // 주최 측은 빈 DB에서 띄운 뒤 시드 계정으로 바로 로그인하므로, 계정이 역할 취준생으로 생겨야 한다.
  it('creates the seed user with role 취준생 and a bcrypt hash when missing', async () => {
    const service = await buildService();
    await service.onApplicationBootstrap();

    expect(userModel.findOne).toHaveBeenCalledWith({ email: SEED_EMAIL });
    expect(create).toHaveBeenCalledTimes(1);
    const [[doc]] = create.mock.calls as [[{ email: string; role: string; passwordHash: string }]];
    expect(doc.email).toBe(SEED_EMAIL);
    expect(doc.role).toBe('취준생');
    // 평문 비밀번호가 DB에 저장되면 유출 시 그대로 노출된다.
    expect(doc.passwordHash).not.toBe(SEED_PASSWORD);
    await expect(bcrypt.compare(SEED_PASSWORD, doc.passwordHash)).resolves.toBe(true);
  });

  // 재기동마다 계정이 늘면 로그인 조회가 모호해진다(두 번 기동해도 1명).
  it('skips creation when the seed user already exists', async () => {
    findOneExec.mockResolvedValue({ email: SEED_EMAIL, role: '취준생', passwordHash: 'x' });
    const service = await buildService();
    await service.onApplicationBootstrap();
    await service.onApplicationBootstrap();
    expect(create).not.toHaveBeenCalled();
  });

  // 동시 기동으로 다른 인스턴스가 먼저 만들면 unique 인덱스가 11000을 낸다. 기동을 막으면 안 된다.
  it('treats a duplicate key error (11000) as already seeded', async () => {
    create.mockRejectedValue(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }));
    const service = await buildService();
    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  // 중복 외의 DB 오류를 삼키면 시드 누락이 운영에서 숨겨진다.
  it('rethrows non-duplicate database errors', async () => {
    create.mockRejectedValue(new Error('connection lost'));
    const service = await buildService();
    await expect(service.onApplicationBootstrap()).rejects.toThrow('connection lost');
  });

  // 시드 값이 비어도 앱(/__health)은 떠야 하므로 예외 없이 건너뛴다.
  it.each([
    ['SEED_USER_EMAIL', ''],
    ['SEED_USER_PASSWORD', ''],
  ])('does not create and does not throw when %s is empty', async (name, value) => {
    process.env[name] = value;
    const service = await buildService();
    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(create).not.toHaveBeenCalled();
  });

  // 대회 규칙: AI 키가 비어도 앱은 기동해야 한다. 시드는 AI 키와 무관해야 한다.
  it('completes bootstrap when AI_GATEWAY_API_KEY is empty', async () => {
    process.env.AI_GATEWAY_API_KEY = '';
    const service = await buildService();
    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(create).toHaveBeenCalledTimes(1);
  });
});
