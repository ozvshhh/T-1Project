import { Server } from 'node:http';
import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  INestApplication,
  Module,
  UnauthorizedException,
} from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../main';
import { AppModule } from '../app.module';
import { AiUnavailableError } from '../ai/ai-unavailable.error';

// 테스트 전용: 예외 종류별로 전역 필터가 같은 형식을 내는지 보려고 일부러 던진다.
@Controller('test-errors')
class ThrowingController {
  @Get('boom')
  boom(): never {
    throw new Error('secret-stack-marker');
  }

  @Get('unauth')
  unauth(): never {
    throw new UnauthorizedException();
  }

  @Get('bad')
  bad(): never {
    throw new BadRequestException();
  }

  @Get('conflict')
  conflict(): never {
    throw new ConflictException();
  }

  @Get('domain')
  domain(): never {
    throw new ConflictException({ code: 'EMAIL_TAKEN', message: '이미 가입된 이메일입니다.' });
  }

  @Get('ai')
  ai(): never {
    throw new AiUnavailableError();
  }
}

@Module({ imports: [AppModule], controllers: [ThrowingController] })
class ThrowingTestModule {}

// 프런트는 error.code로 분기하고, 스택이 본문에 새면 내부 경로·비밀이 외부에 노출된다.
describe('C1-3 전역 예외 필터 (api.md 1절 오류 형식)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer() as Server);

  beforeAll(async () => {
    app = await createApp(ThrowingTestModule);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/nope → 404 { error: { code: NOT_FOUND, message } } only', async () => {
    const res = await http().get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String) as string } });
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.text).not.toContain('statusCode');
    expect(res.text).not.toContain('stack');
  });

  it('일반 Error → 500 INTERNAL, 원래 메시지·스택이 본문에 없음', async () => {
    const res = await http().get('/api/test-errors/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: 'INTERNAL', message: expect.any(String) as string } });
    expect(res.text).not.toContain('secret-stack-marker');
    expect(res.text).not.toContain('at ');
    expect(res.text).not.toContain('.ts');
  });

  it('UnauthorizedException → 401 UNAUTHENTICATED', async () => {
    const res = await http().get('/api/test-errors/unauth');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: 'UNAUTHENTICATED', message: expect.any(String) as string } });
  });

  it('BadRequestException → 400 VALIDATION', async () => {
    const res = await http().get('/api/test-errors/bad');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { code: 'VALIDATION', message: expect.any(String) as string } });
  });

  it('그 밖의 HttpException → status 이름 기반 대문자 코드', async () => {
    const res = await http().get('/api/test-errors/conflict');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: 'CONFLICT', message: expect.any(String) as string } });
  });

  it('예외가 { code, message }를 가지면 그 도메인 코드를 그대로 쓴다', async () => {
    const res = await http().get('/api/test-errors/domain');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: 'EMAIL_TAKEN', message: '이미 가입된 이메일입니다.' } });
  });

  // AI 실패는 api.md 1절대로 502 AI_UNAVAILABLE이어야 프런트가 재시도 버튼을 띄운다. 스택·키가 새면 안 된다.
  it('AiUnavailableError → 502 { error: { code: AI_UNAVAILABLE, message } }, 스택·키 없음', async () => {
    process.env.AI_GATEWAY_API_KEY = 'filter-test-key';
    const res = await http().get('/api/test-errors/ai');
    expect(res.status).toBe(502);
    expect(res.body).toEqual({
      error: { code: 'AI_UNAVAILABLE', message: new AiUnavailableError().message },
    });
    expect(res.text).not.toContain('stack');
    expect(res.text).not.toContain('at ');
    expect(res.text).not.toContain('filter-test-key');
    delete process.env.AI_GATEWAY_API_KEY;
  });

  // 필터가 정상 응답을 건드리면 주최 측 상태 확인이 깨진다.
  it('GET /__health는 여전히 200 { releaseId }', async () => {
    const res = await http().get('/__health');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body as object)).toEqual(['releaseId']);
  });
});
