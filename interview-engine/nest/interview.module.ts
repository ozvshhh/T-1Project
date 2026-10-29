import {
  Inject,
  Injectable,
  Module,
  Optional,
  type DynamicModule,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { MongoClient } from 'mongodb';
import type { Limits } from '../src/config.js';
import { InterviewEngine } from '../src/engine.js';
import { DEFAULT_MODEL, GatewayLlmClient, type GatewayOptions, type LlmClient } from '../src/llm.js';
import { MongoSessionStore, type InterviewSessionDoc } from '../src/mongoStore.js';
import type { SessionStore } from '../src/store.js';
import { InterviewController } from './interview.controller.js';
import { INTERVIEW_ENGINE, INTERVIEW_MONGO_CLIENT } from './interview.tokens.js';

export interface InterviewModuleOptions {
  store: SessionStore;
  llm: LlmClient | null;
  limits?: Partial<Limits>;
}

/** 앱이 꺼질 때 이 모듈이 연 MongoDB 연결을 닫는다. */
@Injectable()
class MongoCloser implements OnApplicationShutdown {
  constructor(@Optional() @Inject(INTERVIEW_MONGO_CLIENT) private readonly client?: MongoClient) {}
  async onApplicationShutdown() {
    await this.client?.close();
  }
}

/**
 * 면접 모듈.
 *
 * 1) 환경변수로 바로 쓰기(권장): AppModule imports에 InterviewModule.fromEnv()
 *    - MONGO_URL (필수), MONGO_DB (기본 app)
 *    - AI_GATEWAY_API_KEY (없으면 기본 질문으로 진행), AI_MODEL (기본 openai/gpt-6.1-terra)
 *    - AI_REASONING_EFFORT (기본 low)
 * 2) 직접 넘기기: InterviewModule.forRoot({ store, llm }) — 테스트나 다른 저장소를 쓸 때
 */
@Module({})
export class InterviewModule {
  static forRoot(options: InterviewModuleOptions): DynamicModule {
    return {
      module: InterviewModule,
      controllers: [InterviewController],
      providers: [{ provide: INTERVIEW_ENGINE, useValue: new InterviewEngine(options) }],
      exports: [INTERVIEW_ENGINE],
    };
  }

  static fromEnv(): DynamicModule {
    return {
      module: InterviewModule,
      controllers: [InterviewController],
      providers: [
        {
          provide: INTERVIEW_MONGO_CLIENT,
          useFactory: async () => {
            const url = process.env.MONGO_URL;
            if (!url) throw new Error('MONGO_URL 환경변수가 필요합니다.');
            const client = new MongoClient(url);
            await client.connect();
            return client;
          },
        },
        {
          provide: INTERVIEW_ENGINE,
          inject: [INTERVIEW_MONGO_CLIENT],
          useFactory: async (client: MongoClient) => {
            const col = client
              .db(process.env.MONGO_DB || 'app')
              .collection<InterviewSessionDoc>('interview_sessions');
            await MongoSessionStore.ensureIndexes(col);
            return new InterviewEngine({ store: new MongoSessionStore(col), llm: llmFromEnv() });
          },
        },
        MongoCloser,
      ],
      exports: [INTERVIEW_ENGINE],
    };
  }
}

/** 키가 없으면 null — 앱은 뜨고 면접은 기본 질문으로 진행된다(안내서: 키가 비어도 앱은 기동해야 함). */
export function llmFromEnv(env: NodeJS.ProcessEnv = process.env): LlmClient | null {
  if (!env.AI_GATEWAY_API_KEY) return null;
  return new GatewayLlmClient({
    apiKey: env.AI_GATEWAY_API_KEY,
    model: env.AI_MODEL || DEFAULT_MODEL,
    reasoningEffort: (env.AI_REASONING_EFFORT as GatewayOptions['reasoningEffort']) || 'low',
  });
}
