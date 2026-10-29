import { AiUnavailableError } from './ai-unavailable.error';
import type { AiJsonRequest } from './ai.service';

type Queued = { ok: true; value: unknown } | { ok: false };

export interface FakeAiCall {
  task: string;
  system: string;
  user: string;
}

// 테스트 전용 AiService 대역. e2e에서 `.overrideProvider(AiService).useValue(fake)`로 끼워
// 실제 Gateway(팀 예산 $10)를 부르지 않고 task별로 미리 넣은 응답·실패를 돌려준다.
export class FakeAiService {
  readonly calls: FakeAiCall[] = [];
  private readonly queues = new Map<string, Queued[]>();

  // task 차례에 돌려줄 응답을 순서대로 넣는다.
  queue(task: string, ...values: unknown[]): this {
    this.queueFor(task).push(...values.map((value): Queued => ({ ok: true, value })));
    return this;
  }

  // task 차례에 AiUnavailableError를 내게 한다(502 AI_UNAVAILABLE 경로 검사용).
  fail(task: string, times = 1): this {
    for (let i = 0; i < times; i++) this.queueFor(task).push({ ok: false });
    return this;
  }

  reset(): void {
    this.calls.length = 0;
    this.queues.clear();
  }

  json<T>(req: AiJsonRequest<T>): Promise<T> {
    // 기능이 AI에 무엇을 보냈는지(system/user) 테스트가 확인할 수 있게 남긴다.
    this.calls.push({ task: req.task, system: req.system, user: req.user });
    const next = this.queues.get(req.task)?.shift();
    // 기본값을 몰래 돌려주면 준비 누락이 통과해 버리므로, 큐가 비면 테스트 오류로 드러낸다.
    if (!next) {
      return Promise.reject(new Error(`FakeAiService: '${req.task}' task에 준비된 응답이 없어요`));
    }
    if (!next.ok) return Promise.reject(new AiUnavailableError());
    // 실제 AiService처럼 schema를 거쳐야 잘못 만든 가짜 응답이 기능 테스트를 속이지 않는다.
    const result = req.schema.safeParse(next.value);
    return result.success ? Promise.resolve(result.data) : Promise.reject(new AiUnavailableError());
  }

  private queueFor(task: string): Queued[] {
    let q = this.queues.get(task);
    if (!q) {
      q = [];
      this.queues.set(task, q);
    }
    return q;
  }
}
