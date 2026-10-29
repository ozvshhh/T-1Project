import { z } from 'zod';
import { AiUnavailableError } from './ai-unavailable.error';
import { FakeAiService } from './fake-ai.service';

// e2e가 실제 Gateway 대신 이 가짜를 쓰므로, 실제 AiService와 같은 계약(검증·실패 오류)을 지켜야 테스트가 의미 있다.
describe('FakeAiService', () => {
  const schema = z.object({ a: z.number() });
  const req = (task: string, system = 's', user = 'u') => ({ task, system, user, schema });
  let fake: FakeAiService;

  beforeEach(() => {
    fake = new FakeAiService();
  });

  it('task별 큐에 넣은 응답을 넣은 순서대로 돌려준다', async () => {
    fake.queue('task-a', { a: 1 }, { a: 2 });
    await expect(fake.json(req('task-a'))).resolves.toEqual({ a: 1 });
    await expect(fake.json(req('task-a'))).resolves.toEqual({ a: 2 });
  });

  it('task별 큐가 섞이지 않는다', async () => {
    fake.queue('task-a', { a: 1 });
    fake.queue('task-b', { a: 9 });
    await expect(fake.json(req('task-b'))).resolves.toEqual({ a: 9 });
    await expect(fake.json(req('task-a'))).resolves.toEqual({ a: 1 });
  });

  it('fail 주입 시 그 차례에 AiUnavailableError, 다음 차례는 큐 응답', async () => {
    fake.fail('task-a');
    fake.queue('task-a', { a: 3 });
    await expect(fake.json(req('task-a'))).rejects.toBeInstanceOf(AiUnavailableError);
    await expect(fake.json(req('task-a'))).resolves.toEqual({ a: 3 });
  });

  // 기본값을 몰래 돌려주면 테스트가 준비 누락을 못 잡는다.
  it('큐가 비었으면 task 이름이 든 오류로 실패한다(AiUnavailableError 아님)', async () => {
    const err: unknown = await fake.json(req('empty-task')).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(AiUnavailableError);
    expect((err as Error).message).toContain('empty-task');
  });

  it('받은 입력 {task, system, user}를 순서대로 기록한다(실패 차례 포함)', async () => {
    fake.queue('task-a', { a: 1 });
    fake.fail('task-b');
    await fake.json(req('task-a', 'sys-1', 'user-1'));
    await fake.json(req('task-b', 'sys-2', 'user-2')).catch(() => undefined);
    expect(fake.calls).toEqual([
      { task: 'task-a', system: 'sys-1', user: 'user-1' },
      { task: 'task-b', system: 'sys-2', user: 'user-2' },
    ]);
  });

  it('큐 응답도 schema로 검증해 맞지 않으면 AiUnavailableError(실제 서비스와 같은 계약)', async () => {
    fake.queue('task-a', { a: 'not-a-number' });
    await expect(fake.json(req('task-a'))).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it('reset은 큐와 기록을 비운다', async () => {
    fake.queue('task-a', { a: 1 });
    await fake.json(req('task-a'));
    fake.queue('task-a', { a: 2 });
    fake.reset();
    expect(fake.calls).toEqual([]);
    await expect(fake.json(req('task-a'))).rejects.not.toBeInstanceOf(AiUnavailableError);
  });
});
