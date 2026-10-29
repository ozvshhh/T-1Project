import { Types } from 'mongoose';
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
