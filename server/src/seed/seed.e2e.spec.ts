import { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import * as os from 'node:os';
import { INestApplication } from '@nestjs/common';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AiService } from '../ai/ai.service';
import { FakeAiService } from '../ai/fake-ai.service';
import { AuthModule } from '../auth/auth.module';
import { ChecksModule } from '../checks/checks.module';
import { AllExceptionsFilter } from '../common/http-exception.filter';
import { CoverLettersModule } from '../cover-letters/cover-letters.module';
import { ExperiencesModule } from '../experiences/experiences.module';
import { ResumeModule } from '../resume/resume.module';
import { SeedService } from '../users/seed.service';
import { UsersModule } from '../users/users.module';

const SEED_EMAIL = 'seeker@example.com';
// 시드 로그인만 확인하면 되므로 실행마다 무작위 값을 쓴다(소스에 비밀번호 리터럴을 두면 비밀 탐지에 걸린다).
const SEED_PASSWORD = randomUUID();

// 기대값은 frontend/specs/mock-data.md 「시드」에서 그대로 옮겼다. 시드 상수를 다시 import하지 않아야 글자가 어긋날 때 테스트가 잡는다.
const EXP1 = {
  title: '캡스톤디자인 학과 공지 알림 앱',
  period: '2025년 1학기',
  clue: '발표 자료 마지막 장: 팀원 4명 역할 분담표 — 나는 백엔드·공지 크롤러',
  facts: {
    situation: '학과 공지가 홈페이지에만 올라와 학생들이 신청 마감을 자주 놓쳤다',
    role: '4명 팀에서 백엔드와 공지 크롤러를 맡았다. 팀장은 다른 팀원이었다',
    action: '공지 게시판을 10분마다 확인해 새 글이 올라오면 앱 푸시를 보내는 크롤러를 만들었다',
    result:
      '학과 단톡방에 공유해 한 학기 동안 시험 운영했고, 공지를 놓쳤다는 말이 줄었다는 반응을 들었다. 사용자 수나 확인율은 따로 재지 않았다',
  },
  candidate: '반복되는 불편을 자동화로 줄이는 데 관심이 생겼다',
};
const EXP2 = {
  title: '교내 해커톤 동아리 회비 정산 웹',
  period: '2025년 여름',
  facts: {
    role: '5명 팀의 팀장으로 기능 범위를 정하고 발표를 맡았다',
    action: '회비 입금 내역을 엑셀로 받아 정산 화면에 올리는 기능을 직접 만들었다',
    result: '48시간 안에 시연까지 마쳤지만 수상은 하지 못했다',
  },
};
const COVER_LETTER = {
  title: '가나다소프트 백엔드 지원',
  body: '저는 캡스톤디자인에서 학과 공지 알림 앱을 개발하며 데이터 기반으로 문제를 해결했습니다. 공지 크롤러를 설계해 학생들의 공지 확인율을 40% 높였고, 팀을 주도해 일정 안에 배포를 마쳤습니다. 교내 해커톤에서는 팀장으로서 동아리 회비 정산 서비스를 기획해 수상권에 근접한 성과를 거두었습니다. 이러한 경험을 바탕으로 사용자의 불편을 데이터로 해결하는 백엔드 개발자가 되겠습니다.',
};
// 이력서 글(mock-data.md 「이력서 (R2)」 코드블록 4줄). 경험·초안 summary는 이 글의 해당 줄에서 앞의 `- `를 뺀 것이다(명세 10).
const RESUME_LINES = {
  capstone: '캡스톤디자인 「학과 공지 알림 앱」 (2025년 1학기, 4인 팀, 백엔드·공지 크롤러 담당)',
  hackathon: '교내 해커톤 「동아리 회비 정산 웹」 (2025년 여름, 5인 팀 팀장)',
  club: '프로그래밍 동아리 운영진 (2024년, 스터디 일정 관리)',
};
const RESUME_TEXT = [
  '컴퓨터공학과 4학년(2026년 2월 졸업 예정)',
  '- 캡스톤디자인 「학과 공지 알림 앱」 (2025년 1학기, 4인 팀, 백엔드·공지 크롤러 담당)',
  '- 교내 해커톤 「동아리 회비 정산 웹」 (2025년 여름, 5인 팀 팀장)',
  '- 프로그래밍 동아리 운영진 (2024년, 스터디 일정 관리)',
].join('\n');
// 작성한 자소서(mock-data.md 「작성한 자소서」). 문항 1 응답은 frontend/src/mocks/db.ts GENERATED_ANSWER와 글자까지 같아야 화면이 목과 같다.
const GENERATED_LETTER = {
  title: '라라테크 백엔드 지원',
  target: { preferred: 'REST API 설계 경험, 협업 도구 사용 경험', talent: '문제를 끝까지 파고드는 사람' },
  q1: '직무 관련 경험을 바탕으로 본인의 강점을 서술하시오',
  q2: '협업 과정에서 갈등을 해결한 경험을 서술하시오',
  reason: '직접 만든 기능과 결과가 문항과 맞아요',
};
const GENERATED_ANSWER =
  '학과 공지가 홈페이지에만 올라와 학생들이 신청 마감을 자주 놓치는 문제가 있었습니다. 저는 4명이 함께한 캡스톤디자인에서 백엔드와 공지 크롤러를 맡아, 공지 게시판을 10분마다 확인해 새 글이 올라오면 앱 푸시를 보내는 크롤러를 직접 만들었습니다. 학과 단톡방에 공유해 한 학기 동안 시험 운영했고, 공지를 놓쳤다는 말이 줄었다는 반응을 들었습니다. 해커톤에서는 5명 팀의 팀장으로 기능 범위를 정하고, 회비 입금 내역을 엑셀로 받아 정산 화면에 올리는 기능을 만들어 48시간 안에 시연까지 마쳤습니다.';
// 대화 질문은 mock-data.md 「AI 고정 동작 › 경험 대화」의 질문 순서, 답은 확정 사실 문장(명세 09 기본: 질문 5·답 4).
const QUESTIONS = [
  '이 경험에서 해결하려던 문제는 무엇이었나요?',
  '그때 본인이 맡은 역할은 무엇이었나요?',
  '구체적으로 어떤 행동을 했나요?',
  '결과는 어땠나요? 직접 확인한 것만 말해 주세요.',
  '이 경험이 지금 지원에 어떤 의미가 있나요?',
];

interface FactBody {
  item: string;
  text: string;
  status: string;
  source: string;
  clueId: string | null;
  origin: string;
}
interface ExperienceBody {
  id: string;
  title: string;
  period: string;
  summary: string;
  clues: { type: string; text: string | null; description: string | null; fileName: string | null }[];
  itemStatus: Record<string, string | null>;
  card: Record<string, FactBody[]>;
  candidates: FactBody[];
}

const confirmed = (item: string, text: string, origin: string) => ({
  item,
  text,
  status: 'confirmed',
  source: 'said',
  clueId: null,
  origin,
});
const pick = (f: FactBody) => ({
  item: f.item,
  text: f.text,
  status: f.status,
  source: f.source,
  clueId: f.clueId,
  origin: f.origin,
});

// 주최 측 E2E와 시연 영상은 빈 DB에서 첫 기동한 앱의 시드 계정 화면을 그대로 쓰므로, 시드가 mock-data.md와 글자까지 같아야 한다(명세 09).
describe('C9-1 seed data on empty DB', () => {
  const saved = {
    JWT_SECRET: process.env.JWT_SECRET,
    SEED_USER_EMAIL: process.env.SEED_USER_EMAIL,
    SEED_USER_PASSWORD: process.env.SEED_USER_PASSWORD,
  };
  let mongod: MongoMemoryServer;
  let app: INestApplication;
  let connection: Connection;
  let token: string;
  const http = () => request(app.getHttpServer() as Server);
  const get = (path: string) => http().get(path).set('Authorization', `Bearer ${token}`).expect(200);

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.SEED_USER_EMAIL = SEED_EMAIL;
    process.env.SEED_USER_PASSWORD = SEED_PASSWORD;
    mongod = await MongoMemoryServer.create();
    // 운영 ServerModule과 같은 모듈 조합으로 띄워 시드가 실제 API 응답으로 보이는지 확인한다. AI는 늘 가짜(비용 0).
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri(), { runtimeAdapters: { os } }),
        UsersModule,
        AuthModule,
        ExperiencesModule,
        CoverLettersModule,
        ChecksModule,
        ResumeModule,
      ],
    })
      .overrideProvider(AiService)
      .useValue(new FakeAiService())
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api', { exclude: ['__health'] });
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    connection = app.get<Connection>(getConnectionToken());
    const res = await http()
      .post('/api/auth/login')
      .send({ email: SEED_EMAIL, password: SEED_PASSWORD })
      .expect(200);
    token = (res.body as { token: string }).token;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await mongod?.stop();
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  async function experiences(): Promise<ExperienceBody[]> {
    return ((await get('/api/experiences')).body as { experiences: ExperienceBody[] }).experiences;
  }
  const byTitle = (list: ExperienceBody[], title: string) => list.find((e) => e.title === title)!;

  it('GET /api/experiences returns the two seed experiences exactly as mock-data.md', async () => {
    const list = await experiences();
    expect(list.map((e) => e.title).sort()).toEqual([EXP1.title, EXP2.title].sort());

    const e1 = byTitle(list, EXP1.title);
    expect(e1.period).toBe(EXP1.period);
    expect(e1.clues.map((c) => ({ type: c.type, text: c.text, description: c.description, fileName: c.fileName }))).toEqual([
      { type: 'text', text: EXP1.clue, description: null, fileName: null },
    ]);
    expect(e1.itemStatus).toEqual({
      situation: 'explained',
      role: 'explained',
      action: 'explained',
      result: 'needs_more',
      meaning: null,
    });
    expect({
      situation: e1.card.situation.map(pick),
      role: e1.card.role.map(pick),
      action: e1.card.action.map(pick),
      result: e1.card.result.map(pick),
      meaning: e1.card.meaning.map(pick),
    }).toEqual({
      situation: [confirmed('situation', EXP1.facts.situation, 'conversation')],
      role: [confirmed('role', EXP1.facts.role, 'conversation')],
      action: [confirmed('action', EXP1.facts.action, 'conversation')],
      result: [confirmed('result', EXP1.facts.result, 'conversation')],
      meaning: [],
    });
    expect(e1.candidates.map(pick)).toEqual([
      {
        item: 'meaning',
        text: EXP1.candidate,
        status: 'candidate',
        source: 'ai_unverified',
        clueId: null,
        origin: 'conversation',
      },
    ]);

    const e2 = byTitle(list, EXP2.title);
    expect(e2.period).toBe(EXP2.period);
    expect(e2.clues).toEqual([]);
    expect(e2.itemStatus).toEqual({ situation: null, role: null, action: null, result: null, meaning: null });
    expect({
      situation: e2.card.situation.map(pick),
      role: e2.card.role.map(pick),
      action: e2.card.action.map(pick),
      result: e2.card.result.map(pick),
      meaning: e2.card.meaning.map(pick),
    }).toEqual({
      situation: [],
      role: [confirmed('role', EXP2.facts.role, 'manual')],
      action: [confirmed('action', EXP2.facts.action, 'manual')],
      result: [confirmed('result', EXP2.facts.result, 'manual')],
      meaning: [],
    });
    expect(e2.candidates).toEqual([]);
  });

  it('conversation: experience 1 alternates ai/user and ends with the meaning question, experience 2 is empty', async () => {
    const list = await experiences();
    const e1 = byTitle(list, EXP1.title);
    const e2 = byTitle(list, EXP2.title);

    const conv1 = (await get(`/api/experiences/${e1.id}/conversation`)).body as {
      messages: { role: string; text: string }[];
    };
    const answers = [EXP1.facts.situation, EXP1.facts.role, EXP1.facts.action, EXP1.facts.result];
    const expected = QUESTIONS.flatMap((q, i) =>
      i < answers.length
        ? [
            { role: 'ai', text: q },
            { role: 'user', text: answers[i] },
          ]
        : [{ role: 'ai', text: q }],
    );
    expect(conv1.messages.map((m) => ({ role: m.role, text: m.text }))).toEqual(expected);
    expect(conv1.messages.at(-1)).toMatchObject({ role: 'ai', text: '이 경험이 지금 지원에 어떤 의미가 있나요?' });

    const conv2 = (await get(`/api/experiences/${e2.id}/conversation`)).body as { messages: unknown[] };
    expect(conv2.messages).toEqual([]);
  });

  // 명세 10이 시드를 자소서 2개로 늘렸다: 개수는 2, 붙여넣은 자소서 본문·점검 없음 단언(09)은 그대로 둔다.
  it('GET /api/cover-letters returns the pasted cover letter with the exact body and no checks', async () => {
    const res = await get('/api/cover-letters');
    const list = (res.body as { coverLetters: { id: string; kind: string; title: string; body: string; items: unknown[] }[] })
      .coverLetters;
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ kind: 'pasted', title: COVER_LETTER.title, body: COVER_LETTER.body, items: [] });

    const checks = (await get(`/api/cover-letters/${list[0].id}/checks`)).body as { checks: unknown[] };
    expect(checks.checks).toEqual([]);
  });

  // 시연 영상과 S1·S2는 시드 이력서의 「확정 전 활동」 하나를 그대로 보여 주므로 글·초안이 mock-data.md와 같아야 한다(명세 10).
  it('C10-5 GET /api/resume returns the seed resume text and the one remaining draft', async () => {
    const { resume } = (await get('/api/resume')).body as {
      resume: {
        text: string | null;
        drafts: { id: unknown; title: string; period: string; summary: string; origin: string }[];
        updatedAt: string | null;
      };
    };
    expect(resume.text).toBe(RESUME_TEXT);
    expect(resume.updatedAt).not.toBeNull();
    expect(resume.drafts).toHaveLength(1);
    expect(typeof resume.drafts[0].id).toBe('string');
    expect(resume.drafts[0]).toMatchObject({
      title: '프로그래밍 동아리 운영진',
      period: '2024년',
      summary: RESUME_LINES.club,
      origin: 'ai',
    });
  });

  // 목록 순서와 summary가 목과 같아야 프런트 목으로 만든 화면·E2E가 실제 서버에서도 같은 자리를 짚는다.
  it('C10-5 GET /api/experiences lists experience 1 then 2, each with its resume line as summary', async () => {
    const list = await experiences();
    expect(list.map((e) => e.title)).toEqual([EXP1.title, EXP2.title]);
    expect(list[0].summary).toBe(RESUME_LINES.capstone);
    expect(list[1].summary).toBe(RESUME_LINES.hackathon);
  });

  // 문항별 작성·자소서 상세 화면은 AI 없이 바로 보여야 한다: 응답·근거 카드를 시드가 직접 넣는다(AI 미호출).
  it('C10-5 cover letters list pasted then generated, and the generated detail matches the mock', async () => {
    const list = ((await get('/api/cover-letters')).body as { coverLetters: { id: string; kind: string; title: string }[] })
      .coverLetters;
    expect(list.map((c) => ({ title: c.title, kind: c.kind }))).toEqual([
      { title: COVER_LETTER.title, kind: 'pasted' },
      { title: GENERATED_LETTER.title, kind: 'generated' },
    ]);

    const exps = await experiences();
    const e1 = byTitle(exps, EXP1.title);
    const e2 = byTitle(exps, EXP2.title);
    const detail = (await get(`/api/cover-letters/${list[1].id}`)).body as {
      coverLetter: {
        target: { preferred: string; talent: string } | null;
        items: {
          question: string;
          recommendations: { experienceId: string; reason: string }[];
          selectedExperienceIds: string[];
          answer: string | null;
          usedExperienceIds: string[];
          answerEdited: boolean;
        }[];
      };
      experiences: { id: string }[];
    };
    expect(detail.coverLetter.target).toEqual(GENERATED_LETTER.target);
    expect(detail.coverLetter.items).toHaveLength(2);
    const [item1, item2] = detail.coverLetter.items;
    expect(item1.question).toBe(GENERATED_LETTER.q1);
    expect(item1.answer).toBe(GENERATED_ANSWER);
    expect(item1.usedExperienceIds).toEqual([e1.id, e2.id]);
    expect(item1.selectedExperienceIds).toEqual([e1.id, e2.id]);
    expect(item1.recommendations).toEqual([
      { experienceId: e1.id, reason: GENERATED_LETTER.reason },
      { experienceId: e2.id, reason: GENERATED_LETTER.reason },
    ]);
    expect(item1.answerEdited).toBe(false);
    expect(new Set(detail.experiences.map((e) => e.id))).toEqual(new Set([e1.id, e2.id]));
    expect(item2).toMatchObject({
      question: GENERATED_LETTER.q2,
      answer: null,
      recommendations: [],
      selectedExperienceIds: [],
      usedExperienceIds: [],
    });
  });

  // 컨테이너가 재기동돼도 시드가 다시 쌓이면 목록이 늘어 E2E 흐름이 틀어진다.
  it('running the seed again keeps the same counts', async () => {
    await app.get(SeedService).onApplicationBootstrap();
    await app.get(SeedService).onApplicationBootstrap();

    expect(await connection.collection('users').countDocuments({ email: SEED_EMAIL })).toBe(1);
    const list = await experiences();
    expect(list).toHaveLength(2);
    const e1 = byTitle(list, EXP1.title);
    const e2 = byTitle(list, EXP2.title);
    const conv1 = (await get(`/api/experiences/${e1.id}/conversation`)).body as { messages: unknown[] };
    const conv2 = (await get(`/api/experiences/${e2.id}/conversation`)).body as { messages: unknown[] };
    expect(conv1.messages).toHaveLength(9);
    expect(conv2.messages).toHaveLength(0);
    expect(await connection.collection('facts').countDocuments()).toBe(8);
    expect(await connection.collection('clues').countDocuments()).toBe(1);
    const letters = (await get('/api/cover-letters')).body as { coverLetters: unknown[] };
    expect(letters.coverLetters).toHaveLength(2);
    expect(await connection.collection('resumes').countDocuments()).toBe(1);
    const { resume } = (await get('/api/resume')).body as { resume: { drafts: unknown[] } };
    expect(resume.drafts).toHaveLength(1);
  });
});
