import { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

export interface DraftFields {
  title: string;
  period?: string;
  summary?: string;
}

// 경험은 이력서 초안을 확정해서만 만든다(명세 10). 테스트도 사용자와 같은 길(초안 추가 → 확정)로 경험을 만들어
// 경험을 따로 만드는 경로가 다시 생기지 않았는지, 확정 경험이 다른 기능과 맞물리는지 함께 확인한다.
export async function createExperienceViaResume<T = { id: string }>(
  app: INestApplication,
  token: string,
  fields: DraftFields,
): Promise<T> {
  const http = () => request(app.getHttpServer() as Server);
  const auth = { Authorization: `Bearer ${token}` };
  const draft = await http().post('/api/resume/drafts').set(auth).send(fields).expect(201);
  const draftId = (draft.body as { draft: { id: string } }).draft.id;
  const confirmed = await http()
    .post('/api/resume/drafts/confirm')
    .set(auth)
    .send({ draftIds: [draftId] })
    .expect(201);
  return (confirmed.body as { experiences: T[] }).experiences[0];
}
