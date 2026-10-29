import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { asObject } from '../auth/signup.validation';
import { FactOrigin, FactSource, FactStatus } from '../experiences/fact.schema';
import { Item } from '../experiences/experience.schema';
import { Check, CheckCandidate, CheckSentence, JudgeResult, SentenceStatus } from './check.schema';

// api.md 2절 CheckSentence·Check 응답 모양.
export interface CheckSentenceDto {
  id: string;
  text: string;
  coverLetterItemId: string | null;
  status: SentenceStatus;
  turns: { question: string; answer: string | null; judge: JudgeResult[] }[];
  followUpsLeft: number;
}

export interface CheckCandidateDto {
  id: string;
  item: Item;
  text: string;
  status: FactStatus;
  source: FactSource;
  clueId: string | null;
  origin: FactOrigin;
  createdAt: string;
  experienceId: string | null;
}

export interface CheckDto {
  id: string;
  coverLetterId: string;
  stale: boolean;
  sentences: CheckSentenceDto[];
  candidates: CheckCandidateDto[];
  createdAt: string;
}

// 답하기 응답(api.md 9절). 후보를 점검에 쌓는 일은 C8-4가 맡는다.
export interface AnswerResultDto {
  sentence: CheckSentenceDto;
  newCandidates: CheckCandidateDto[];
}

// 답하기 본문 { text }(api.md 9절). 공백만 있는 답은 판정할 내용 없이 AI 비용만 쓰므로 빈 값과 같이 400.
export function validateAnswerText(body: unknown): string {
  const text = asObject(body).text;
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (trimmed === '') {
    throw new BadRequestException({
      code: 'VALIDATION',
      message: '입력값을 확인해 주세요.',
      details: [{ field: 'text', reason: '답을 입력해 주세요.' }],
    });
  }
  return trimmed;
}

type CheckRecord = Check & { _id: Types.ObjectId };

export function toSentenceDto(s: CheckSentence & { _id: Types.ObjectId }): CheckSentenceDto {
  return {
    id: String(s._id),
    text: s.text,
    coverLetterItemId: s.coverLetterItemId ? String(s.coverLetterItemId) : null,
    status: s.status,
    turns: (s.turns ?? []).map((t) => ({
      question: t.question,
      answer: t.answer ?? null,
      judge: (t.judge ?? []).map((j) => ({ id: j.id, result: j.result })),
    })),
    followUpsLeft: s.followUpsLeft,
  };
}

function toCandidateDto(c: CheckCandidate & { _id: Types.ObjectId }): CheckCandidateDto {
  return {
    id: String(c._id),
    item: c.item,
    text: c.text,
    status: c.status,
    source: c.source,
    clueId: c.clueId ? String(c.clueId) : null,
    origin: c.origin,
    createdAt: c.createdAt.toISOString(),
    experienceId: c.experienceId ? String(c.experienceId) : null,
  };
}

// 응답에 userId·_id·__v가 새지 않도록 키를 하나씩 골라 조립한다(R1).
export function toCheckDto(check: CheckRecord): CheckDto {
  return {
    id: String(check._id),
    coverLetterId: String(check.coverLetterId),
    stale: check.stale ?? false,
    sentences: (check.sentences ?? []).map(toSentenceDto),
    candidates: (check.candidates ?? []).map(toCandidateDto),
    createdAt: check.createdAt.toISOString(),
  };
}
