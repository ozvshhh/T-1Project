#!/usr/bin/env node
// 결정적 검사기. LLM이 아니라 이 파일이 다음 역할을 고르고 완료를 판정한다(위키 ralph 지침 8절 37번).
// 사용: node check.mjs load 01 | next | after <role> <C> | status | unblock <C>
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '..', '..');           // 저장소 루트
const ledgerPath = path.join(here, 'ledger.json');
const MAX_FIX = 3;                                      // 주장별 수정 상한(위키 37번)

const load = () => JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
const save = (l) => fs.writeFileSync(ledgerPath, JSON.stringify(l, null, 2) + '\n');
const git = (cmd) => execSync(`git ${cmd}`, { cwd: root, encoding: 'utf8' }).trim();
const firstLine = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n')[0].trim() : '');

const [cmd, a1, a2] = process.argv.slice(2);

if (cmd === 'load') {
  // specs/<번호>-*.md 안의 "- [ ] C<번호>-<n> (docker)? : 제목" 줄을 주장으로 적재
  const spec = fs.readdirSync(path.join(here, 'specs')).find((f) => f.startsWith(a1 + '-'));
  if (!spec) throw new Error(`specs/${a1}-*.md 없음`);
  const text = fs.readFileSync(path.join(here, 'specs', spec), 'utf8');
  const ledger = load();
  let added = 0;
  for (const m of text.matchAll(/^- \[ \] (C\d+-\d+)(?: \((docker)\))?: (.+)$/gm)) {
    if (ledger.claims.some((c) => c.id === m[1])) continue;
    ledger.claims.push({ id: m[1], spec, title: m[3].trim(), docker: m[2] === 'docker', status: 'todo', fixCount: 0, snapshot: null });
    added++;
  }
  save(ledger);
  console.log(`loaded ${added} claims from ${spec}; total ${ledger.claims.length}`);
} else if (cmd === 'next') {
  const l = load();
  if (l.claims.some((c) => c.status === 'blocked')) { console.log('BLOCKED'); process.exit(0); }
  const fixed = l.claims.find((c) => c.status === 'fixed');
  const fail = l.claims.find((c) => c.status === 'fail');
  const todo = l.claims.find((c) => c.status === 'todo');
  // fix > confirm > verify 순(위키 37번). fixed는 confirm 대상, fail은 fix 대상.
  if (fail) console.log(`fix ${fail.id}`);
  else if (fixed) console.log(`confirm ${fixed.id}`);
  else if (todo) console.log(`verify ${todo.id}`);
  else console.log('COMPLETE');
} else if (cmd === 'after') {
  const [role, id] = [a1, a2];
  const l = load();
  const c = l.claims.find((x) => x.id === id);
  if (!c) throw new Error(`주장 없음: ${id}`);
  if (role === 'verify') {
    const v = firstLine(path.join(here, 'reviews', `${id}.md`));
    if (v === 'VERDICT: PASS') c.status = 'pass';
    else if (v === 'VERDICT: FAIL') { c.status = 'fail'; }
    else { c.status = 'fail'; fs.appendFileSync(path.join(here, 'reviews', `${id}.md`), '\n\n(check.mjs) 첫 줄이 VERDICT: PASS|FAIL 형식이 아니어서 FAIL로 처리\n'); }
  } else if (role === 'fix') {
    // 수정 전 스냅샷은 before에서 저장. 커밋이 없으면 수정 실패로 보고 fixCount만 올린다.
    const head = git('rev-parse HEAD');
    if (head === c.snapshot) { c.fixCount++; c.status = c.fixCount > MAX_FIX ? 'blocked' : 'fail'; }
    else c.status = 'fixed';
  } else if (role === 'confirm') {
    const n = c.fixCount + 1;
    const v = firstLine(path.join(here, 'confirms', `${id}-${n}.md`));
    if (v === 'CONFIRM: OK') { c.status = 'todo'; c.fixCount = n; }     // 다시 verify로
    else { c.fixCount = n; c.status = c.fixCount >= MAX_FIX ? 'blocked' : 'fail'; }
  }
  if (c.status === 'blocked') {
    fs.writeFileSync(path.join(here, 'BLOCKED.md'), `# BLOCKED ${id}\n\n${c.title}\n\n수정 ${c.fixCount}회 뒤에도 확인을 통과하지 못했다. reviews/${id}.md와 confirms/${id}-*.md를 읽고 사람이 판단한다(명세 수정 / 되돌리기 / 표지판 추가). 다시 열려면: node server/ralph/check.mjs unblock ${id}\n`);
  }
  save(l);
  console.log(`${id} -> ${c.status} (fix ${c.fixCount})`);
} else if (cmd === 'before') {
  // fix 전에 스냅샷 저장(confirm이 diff 기준으로 씀)
  const l = load(); const c = l.claims.find((x) => x.id === a2);
  c.snapshot = git('rev-parse HEAD'); save(l); console.log(c.snapshot);
} else if (cmd === 'reset') {
  // 도구 문제로 막힌 주장을 처음부터(todo, fixCount 0) 다시 검증한다
  const l = load(); const c = l.claims.find((x) => x.id === a1);
  c.status = 'todo'; c.fixCount = 0; c.snapshot = null; save(l);
  if (fs.existsSync(path.join(here, 'BLOCKED.md'))) fs.unlinkSync(path.join(here, 'BLOCKED.md'));
  console.log(`${a1} reset to todo`);
} else if (cmd === 'unblock') {
  const l = load(); const c = l.claims.find((x) => x.id === a1);
  c.status = 'fail'; c.fixCount = 0; save(l);
  if (fs.existsSync(path.join(here, 'BLOCKED.md'))) fs.unlinkSync(path.join(here, 'BLOCKED.md'));
  console.log(`${a1} reopened`);
} else if (cmd === 'status') {
  for (const c of load().claims) console.log(`${c.id.padEnd(6)} ${c.status.padEnd(8)} fix=${c.fixCount} ${c.docker ? '[docker] ' : ''}${c.title}`);
} else if (cmd === 'count') {
  console.log(load().claims.length);
} else {
  console.error('usage: check.mjs load <nn> | next | before fix <C> | after <role> <C> | status | unblock <C> | reset <C> | count');
  process.exit(2);
}
