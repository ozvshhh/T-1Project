// 네임스페이스 import는 속성을 고칠 수 없어 spyOn이 막힌다. 실제 모듈 객체를 받아야 multer가 쓰는 fs 호출을 감시할 수 있다.
import fs from 'node:fs';
import { Server } from 'node:http';
import * as os from 'node:os';
import { INestApplication } from '@nestjs/common';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection, Types } from 'mongoose';
import request from 'supertest';
import { AuthModule } from '../auth/auth.module';
import { AllExceptionsFilter } from '../common/http-exception.filter';
import { ResumeModule } from '../resume/resume.module';
import { createExperienceViaResume } from '../resume/resume.test-helper';
import { UsersModule } from '../users/users.module';
import { ExperiencesModule } from './experiences.module';

interface ClueBody {
  id: string;
  type: string;
  description: string | null;
  text: string | null;
  fileName: string | null;
  createdAt: string;
}

interface ExperienceBody {
  id: string;
  clues: ClueBody[];
  updatedAt: string;
}

interface ErrorBody {
  error: { code: string; message: string; details?: { field: string; reason: string }[] };
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 운영 createApp과 같은 prefix·오류 필터로 띄운다. CLUE_MAX_BYTES는 모듈을 만들 때 읽으므로 env를 먼저 정한다.
async function bootApp(
  maxBytes: string | undefined,
): Promise<{ app: INestApplication; mongod: MongoMemoryServer; connection: Connection }> {
  const saved = process.env.CLUE_MAX_BYTES;
  if (maxBytes === undefined) delete process.env.CLUE_MAX_BYTES;
  else process.env.CLUE_MAX_BYTES = maxBytes;
  try {
    const mongod = await MongoMemoryServer.create();
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri(), { runtimeAdapters: { os } }),
        UsersModule,
        AuthModule,
        ExperiencesModule,
        ResumeModule,
      ],
    }).compile();
    const app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api', { exclude: ['__health'] });
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    const connection = app.get<Connection>(getConnectionToken());
    await connection.model('User').syncIndexes();
    return { app, mongod, connection };
  } finally {
    if (saved === undefined) delete process.env.CLUE_MAX_BYTES;
    else process.env.CLUE_MAX_BYTES = saved;
  }
}

function helpers(getApp: () => INestApplication) {
  const http = () => request(getApp().getHttpServer() as Server);
  return {
    http,
    async signup(email: string): Promise<string> {
      const res = await http().post('/api/auth/signup').send({ email, password: 'pass-1234' }).expect(201);
      return (res.body as { token: string }).token;
    },
    // 경험은 이력서 초안 확정으로만 만든다(명세 10).
    async createExperience(token: string): Promise<ExperienceBody> {
      return createExperienceViaResume<ExperienceBody>(getApp(), token, { title: '동아리 축제', period: '2025년 여름' });
    },
    postFile(
      token: string,
      expId: string,
      opts: { type?: string; description?: string; file?: { data: Buffer; filename: string; contentType: string } },
    ) {
      let req = http().post(`/api/experiences/${expId}/clues`).set('Authorization', `Bearer ${token}`);
      if (opts.type !== undefined) req = req.field('type', opts.type);
      if (opts.description !== undefined) req = req.field('description', opts.description);
      if (opts.file) req = req.attach('file', opts.file.data, { filename: opts.file.filename, contentType: opts.file.contentType });
      return req;
    },
  };
}

const expectValidation = (res: request.Response, field: string) => {
  expect(res.status).toBe(400);
  const body = res.body as ErrorBody;
  expect(body.error.code).toBe('VALIDATION');
  expect(body.error.details?.map((d) => d.field)).toContain(field);
};

const expectNotFound = (res: request.Response) => {
  expect(res.status).toBe(404);
  expect((res.body as ErrorBody).error.code).toBe('NOT_FOUND');
};

// 버퍼 그대로 받기: supertest가 application/pdf 본문을 Buffer로 모으게 한다.
function binaryParser(res: request.Response, cb: (err: Error | null, body: Buffer) => void) {
  // superagent가 넘기는 res는 실제로는 Node 응답 스트림이다.
  const stream = res as unknown as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  stream.on('end', () => cb(null, Buffer.concat(chunks)));
}

// 단서는 경험 대화(R3)와 "자료로 확인"(R5)의 근거다. 저장이 틀리거나 남에게 보이면 출처가 거짓이 된다(R2).
describe('C5-2 POST /api/experiences/:id/clues and GET .../clues/:clueId/file', () => {
  const savedSecret = process.env.JWT_SECRET;
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let connection: Connection;
  const h = helpers(() => app);
  let tokenA: string;
  let tokenB: string;
  let exp: ExperienceBody;

  const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0, 1, 2, 255]);

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret';
    ({ app, mongod, connection } = await bootApp(undefined));
  }, 120_000);

  beforeEach(async () => {
    tokenA = await h.signup('a@example.com');
    tokenB = await h.signup('b@example.com');
    exp = await h.createExperience(tokenA);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await connection.collection('users').deleteMany({});
    await connection.collection('experiences').deleteMany({});
    await connection.collection('clues').deleteMany({});
  });

  afterAll(async () => {
    await app?.close();
    await mongod?.stop();
    if (savedSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = savedSecret;
  });

  // 프런트는 api.md 2절 Clue 모양으로 그리므로 키가 정확해야 하고, 바이트·userId 같은 내부 칸이 새면 안 된다.
  it('JSON text clue returns 201 {clue} with exactly the Clue keys', async () => {
    const res = await h
      .http()
      .post(`/api/experiences/${exp.id}/clues`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ type: 'text', text: '  부스 매출 표를 직접 만들었다  ' });

    expect(res.status).toBe(201);
    expect(Object.keys(res.body as object)).toEqual(['clue']);
    const clue = (res.body as { clue: ClueBody }).clue;
    expect(Object.keys(clue).sort()).toEqual(['createdAt', 'description', 'fileName', 'id', 'text', 'type'].sort());
    expect(clue.id).toMatch(/^[0-9a-f]{24}$/);
    expect(clue).toMatchObject({ type: 'text', text: '부스 매출 표를 직접 만들었다', description: null, fileName: null });
    expect(clue.createdAt).toMatch(ISO);
  });

  // 내용 없는 텍스트 단서는 근거가 될 수 없으므로 저장하지 않고 칸을 짚어 400으로 돌려보낸다.
  it.each([
    ['text missing', { type: 'text' }, 'text'],
    ['text blank', { type: 'text', text: '   ' }, 'text'],
    ['text not a string', { type: 'text', text: 42 }, 'text'],
    ['file type sent as JSON', { type: 'photo', text: '사진' }, 'type'],
  ])('JSON clue rejects %s with 400 VALIDATION', async (_label, body, field) => {
    const res = await h
      .http()
      .post(`/api/experiences/${exp.id}/clues`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send(body);
    expectValidation(res, field);
    expect(await connection.collection('clues').countDocuments()).toBe(0);
  });

  // 파일 단서는 type·파일 이름·설명을 돌려주고 text는 비어 있다. 바이트는 응답에 싣지 않는다.
  it('multipart file clue returns 201 {clue} with fileName and description', async () => {
    const res = await h.postFile(tokenA, exp.id, {
      type: 'award',
      description: '교내 축제 우수 부스 상',
      file: { data: PDF, filename: '상장.pdf', contentType: 'application/pdf' },
    });

    expect(res.status).toBe(201);
    const clue = (res.body as { clue: ClueBody }).clue;
    expect(Object.keys(clue).sort()).toEqual(['createdAt', 'description', 'fileName', 'id', 'text', 'type'].sort());
    expect(clue).toMatchObject({ type: 'award', description: '교내 축제 우수 부스 상', text: null, fileName: '상장.pdf' });
  });

  // description은 선택이다: 설명 없는 파일도 "자료로 확인" 근거로 쓸 수 있어야 한다(api.md 4절).
  it('multipart file clue without description stores description null', async () => {
    const res = await h.postFile(tokenA, exp.id, {
      type: 'photo',
      file: { data: Buffer.from([1, 2, 3]), filename: 'booth.jpg', contentType: 'image/jpeg' },
    });
    expect(res.status).toBe(201);
    expect((res.body as { clue: ClueBody }).clue).toMatchObject({ type: 'photo', description: null, fileName: 'booth.jpg' });
  });

  // 종류가 틀리거나 파일이 없으면 무엇을 저장할지 알 수 없으므로 400으로 막는다.
  it.each([
    ['type missing', { file: true }, 'type'],
    ['type video', { type: 'video', file: true }, 'type'],
    ['type text via multipart', { type: 'text', file: true }, 'type'],
    ['file missing', { type: 'document' }, 'file'],
  ])('multipart clue rejects %s with 400 VALIDATION', async (_label, opts, field) => {
    const res = await h.postFile(tokenA, exp.id, {
      type: (opts as { type?: string }).type,
      file: (opts as { file?: boolean }).file
        ? { data: Buffer.from([9]), filename: 'a.bin', contentType: 'application/octet-stream' }
        : undefined,
    });
    expectValidation(res, field);
    expect(await connection.collection('clues').countDocuments()).toBe(0);
  });

  // 경험 상세의 clues에 보여야 프런트가 단서 목록을 다시 그릴 수 있고, updatedAt이 올라야 목록 순서가 맞는다(R6).
  it('added clues appear in GET /api/experiences/:id and bump updatedAt', async () => {
    await sleep(15);
    const t = await h
      .http()
      .post(`/api/experiences/${exp.id}/clues`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ type: 'text', text: '메모' })
      .expect(201);
    await sleep(5);
    const f = await h
      .postFile(tokenA, exp.id, {
        type: 'document',
        description: '기획서',
        file: { data: PDF, filename: 'plan.pdf', contentType: 'application/pdf' },
      })
      .expect(201);

    const res = await h.http().get(`/api/experiences/${exp.id}`).set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    const after = (res.body as { experience: ExperienceBody }).experience;
    expect(after.clues).toEqual([(t.body as { clue: ClueBody }).clue, (f.body as { clue: ClueBody }).clue]);
    expect(Date.parse(after.updatedAt)).toBeGreaterThan(Date.parse(exp.updatedAt));

    // 목록도 같은 조립을 써야 카드 목록과 상세가 어긋나지 않는다.
    const list = await h.http().get('/api/experiences').set('Authorization', `Bearer ${tokenA}`);
    expect((list.body as { experiences: ExperienceBody[] }).experiences[0].clues).toHaveLength(2);
  });

  // 배포 컨테이너에는 영구 디스크가 없어 디스크에 쓰면 재시작 때 파일이 사라진다. 바이트는 Mongo 문서에 있어야 한다.
  it('stores file bytes in Mongo and never writes to disk', async () => {
    const writeFile = jest.spyOn(fs, 'writeFile');
    const writeFileSync = jest.spyOn(fs, 'writeFileSync');
    const createWriteStream = jest.spyOn(fs, 'createWriteStream');
    const promisesWrite = jest.spyOn(fs.promises, 'writeFile');

    const res = await h.postFile(tokenA, exp.id, {
      type: 'award',
      file: { data: PDF, filename: 'award.pdf', contentType: 'application/pdf' },
    });
    expect(res.status).toBe(201);
    expect(writeFile).not.toHaveBeenCalled();
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(createWriteStream).not.toHaveBeenCalled();
    expect(promisesWrite).not.toHaveBeenCalled();

    const id = (res.body as { clue: ClueBody }).clue.id;
    const doc = await connection.collection('clues').findOne({ _id: new Types.ObjectId(id) });
    expect(doc).not.toBeNull();
    const data = doc!.data as { buffer: Uint8Array };
    expect(Buffer.from(data.buffer).equals(PDF)).toBe(true);
    expect(doc!.userId).toBeDefined();
  });

  // "자료로 확인"할 때 사용자가 올린 파일을 그대로 다시 봐야 한다(R5): 바이트·형식·이름이 바뀌면 근거가 흐려진다.
  it('GET .../clues/:clueId/file returns the uploaded bytes, Content-Type and file name', async () => {
    const up = await h
      .postFile(tokenA, exp.id, {
        type: 'award',
        file: { data: PDF, filename: '상장 (최종).pdf', contentType: 'application/pdf' },
      })
      .expect(201);
    const clueId = (up.body as { clue: ClueBody }).clue.id;

    const res = await h
      .http()
      .get(`/api/experiences/${exp.id}/clues/${clueId}/file`)
      .set('Authorization', `Bearer ${tokenA}`)
      .buffer(true)
      .parse(binaryParser);

    expect(res.status).toBe(200);
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect((res.body as Buffer).equals(PDF)).toBe(true);
    expect(res.headers['content-type']).toMatch(/^application\/pdf/);
    const disposition = res.headers['content-disposition'];
    expect(disposition).toMatch(/^attachment;/);
    // 한글 이름은 RFC 5987 filename*로 실어야 브라우저가 깨지지 않게 저장한다. 괄호도 퍼센트 인코딩해야 한다.
    const encoded = /filename\*=UTF-8''([^;\s]+)/.exec(disposition)![1];
    expect(encoded).not.toMatch(/[()'*\s]/);
    expect(decodeURIComponent(encoded)).toBe('상장 (최종).pdf');
  });

  // 텍스트 단서엔 파일이 없고, 남의 것·다른 경험 경로·잘못된 id는 모두 같은 404여야 존재 여부가 새지 않는다(R1).
  it('GET .../file 404s for text clues, other users, other experiences and malformed ids', async () => {
    const text = await h
      .http()
      .post(`/api/experiences/${exp.id}/clues`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ type: 'text', text: '메모' })
      .expect(201);
    const textId = (text.body as { clue: ClueBody }).clue.id;
    const file = await h
      .postFile(tokenA, exp.id, {
        type: 'photo',
        file: { data: PDF, filename: 'p.png', contentType: 'image/png' },
      })
      .expect(201);
    const fileId = (file.body as { clue: ClueBody }).clue.id;
    const other = await h.createExperience(tokenA);

    const get = (token: string, expId: string, clueId: string) =>
      h.http().get(`/api/experiences/${expId}/clues/${clueId}/file`).set('Authorization', `Bearer ${token}`);

    expectNotFound(await get(tokenA, exp.id, textId));
    expectNotFound(await get(tokenB, exp.id, fileId));
    expectNotFound(await get(tokenA, other.id, fileId));
    expectNotFound(await get(tokenA, exp.id, 'abc'));
    expectNotFound(await get(tokenA, 'abc', fileId));
    expectNotFound(await get(tokenA, exp.id, '0123456789abcdef01234567'));
  });

  // 남의 경험에 단서를 붙일 수 있으면 계정 분리가 깨진다. 없는 id·잘못된 형식도 404이고 아무것도 저장하지 않는다.
  it('POST clues 404s for other users, missing ids and malformed ids', async () => {
    const post = (token: string, expId: string) =>
      h.http().post(`/api/experiences/${expId}/clues`).set('Authorization', `Bearer ${token}`).send({ type: 'text', text: '가로채기' });

    expectNotFound(await post(tokenB, exp.id));
    expectNotFound(await post(tokenA, '0123456789abcdef01234567'));
    expectNotFound(await post(tokenA, 'abc'));
    expectNotFound(
      await h.postFile(tokenB, exp.id, {
        type: 'photo',
        file: { data: PDF, filename: 'p.png', contentType: 'image/png' },
      }),
    );
    expect(await connection.collection('clues').countDocuments()).toBe(0);
  });

  // 로그인 전 사용자는 단서를 올리거나 받을 수 없어야 한다(C3).
  it('requires a token', async () => {
    const post = await h.http().post(`/api/experiences/${exp.id}/clues`).send({ type: 'text', text: 'x' });
    expect(post.status).toBe(401);
    const get = await h.http().get(`/api/experiences/${exp.id}/clues/0123456789abcdef01234567/file`);
    expect(get.status).toBe(401);
  });
});

// 한도를 넘는 파일을 받으면 Mongo 문서 한도·메모리를 넘길 수 있다. 413·500이 아니라 칸을 짚은 400이어야 프런트가 안내한다.
describe('C5-2 CLUE_MAX_BYTES limit', () => {
  const savedSecret = process.env.JWT_SECRET;
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let connection: Connection;
  const h = helpers(() => app);

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret';
    ({ app, mongod, connection } = await bootApp('10'));
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await mongod?.stop();
    if (savedSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = savedSecret;
  });

  it('rejects a file over CLUE_MAX_BYTES with 400 VALIDATION (field file) and accepts one at the limit', async () => {
    const token = await h.signup('limit@example.com');
    const exp = await h.createExperience(token);

    const over = await h.postFile(token, exp.id, {
      type: 'document',
      file: { data: Buffer.alloc(11, 1), filename: 'big.bin', contentType: 'application/octet-stream' },
    });
    expectValidation(over, 'file');
    expect(await connection.collection('clues').countDocuments()).toBe(0);

    const atLimit = await h.postFile(token, exp.id, {
      type: 'document',
      file: { data: Buffer.alloc(10, 1), filename: 'ok.bin', contentType: 'application/octet-stream' },
    });
    expect(atLimit.status).toBe(201);
  });
});
