import {
  Inject,
  Injectable,
  Module,
  Optional,
  type DynamicModule,
  type InjectionToken,
  type ModuleMetadata,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { MongoClient } from 'mongodb';
import type { Limits } from '../src/config.js';
import { InterviewEngine } from '../src/engine.js';
import { DEFAULT_MODEL, GatewayLlmClient, type GatewayOptions, type LlmClient } from '../src/llm.js';
import { MongoSessionStore, type InterviewSessionDoc } from '../src/mongoStore.js';
import type { SessionStore } from '../src/store.js';
import type { CoverLetterSource } from '../src/types.js';
import { InterviewController } from './interview.controller.js';
import { INTERVIEW_COVER_LETTERS, INTERVIEW_ENGINE, INTERVIEW_MONGO_CLIENT } from './interview.tokens.js';

export interface InterviewModuleOptions {
  store: SessionStore;
  llm: LlmClient | null;
  coverLetters?: CoverLetterSource | null;
  limits?: Partial<Limits>;
}

export interface InterviewFromEnvOptions {
  /** coverLetterSource를 내주는 모듈(예: 자기소개서 모듈) */
  imports?: ModuleMetadata['imports'];
  /**
   * CoverLetterSource를 구현한 provider의 토큰(보통 서비스 클래스).
   * 주면 면접을 자기소개서 id로 시작하고, 승인한 수정 제안을 그 자기소개서에 저장한다.
   */
  coverLetterSource?: InjectionToken;
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
 * 1) 환경변수로 바로 쓰기(권장): AppModule imports에
 *      InterviewModule.fromEnv({ imports: [CoverLetterModule], coverLetterSource: CoverLetterService })
 *    - DATABASE_URL (MongoDB 주소, 필수. 없으면 MONGO_URL), MONGO_DB (없으면 주소의 DB 이름, 그것도 없으면 app)
 *    - AI_GATEWAY_API_KEY (없으면 기본 질문으로 진행), AI_MODEL (기본 openai/gpt-6.1-terra)
 *    - AI_REASONING_EFFORT (기본 low)
 * 2) 직접 넘기기: InterviewModule.forRoot({ store, llm, coverLetters }) — 테스트나 다른 저장소를 쓸 때
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

  static fromEnv(options: InterviewFromEnvOptions = {}): DynamicModule {
    return {
      module: InterviewModule,
      imports: options.imports ?? [],
      controllers: [InterviewController],
      providers: [
        options.coverLetterSource
          ? { provide: INTERVIEW_COVER_LETTERS, useExisting: options.coverLetterSource }
          : { provide: INTERVIEW_COVER_LETTERS, useValue: null },
        {
          provide: INTERVIEW_MONGO_CLIENT,
          useFactory: async () => {
            const url = mongoUrlFromEnv();
            if (!url) throw new Error('DATABASE_URL(MongoDB 주소) 환경변수가 필요합니다.');
            const client = new MongoClient(url);
            await client.connect();
            return client;
          },
        },
        {
          provide: INTERVIEW_ENGINE,
          inject: [INTERVIEW_MONGO_CLIENT, INTERVIEW_COVER_LETTERS],
          useFactory: async (client: MongoClient, coverLetters: CoverLetterSource | null) => {
            const col = client
              .db(mongoDbNameFromEnv())
              .collection<InterviewSessionDoc>('interview_sessions');
            await MongoSessionStore.ensureIndexes(col);
            return new InterviewEngine({ store: new MongoSessionStore(col), llm: llmFromEnv(), coverLetters });
          },
        },
        MongoCloser,
      ],
      exports: [INTERVIEW_ENGINE],
    };
  }
}

/** README 구현 설계대로 DATABASE_URL을 먼저 읽고, 없으면 MONGO_URL */
export function mongoUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.DATABASE_URL || env.MONGO_URL || undefined;
}

/** MONGO_DB → 주소에 적힌 DB 이름 → app */
export function mongoDbNameFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  if (env.MONGO_DB) return env.MONGO_DB;
  const url = mongoUrlFromEnv(env);
  const m = url ? /^mongodb(?:\+srv)?:\/\/[^/]+\/([^?/]+)/.exec(url) : null;
  return m?.[1] ? decodeURIComponent(m[1]) : 'app';
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
