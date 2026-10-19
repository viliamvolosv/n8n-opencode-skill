import test from 'node:test';
import assert from 'node:assert/strict';
import { lastJsonAnswer } from './model-output.mjs';

const text = value => ({ type: 'text', part: { text: value } });
const answer = { workflow_id: 'test-id', webhook_path: 'skill-ci/test-path' };
test('reads the final JSON object', () => {
  assert.deepEqual(lastJsonAnswer([text(JSON.stringify(answer))]), answer);
});
test('reads a fenced JSON object', () => {
  assert.deepEqual(lastJsonAnswer([text('```json\n' + JSON.stringify(answer) + '\n```')]), answer);
});
test('accepts an explicit thinking boundary before the final JSON', () => {
  assert.deepEqual(lastJsonAnswer([text('Planning {not JSON}\n</think>' + JSON.stringify(answer))]), answer);
});
test('rejects prose without a recognized boundary and malformed final answers', () => {
  for (const value of ['Done: ' + JSON.stringify(answer), '{broken', 'null', '[]', '42']) {
    assert.equal(lastJsonAnswer([text(value)]), undefined);
  }
});
test('does not substitute an earlier valid answer for an invalid latest answer', () => {
  assert.equal(lastJsonAnswer([text(JSON.stringify(answer)), text('not JSON')]), undefined);
  assert.equal(lastJsonAnswer([]), undefined);
});

test('recovered provider errors do not invalidate a later answer', async () => {
  const {terminalModelError}=await import('./model-output.mjs');
  const error={type:'error',error:{message:'Interrupted stream'}};
  const answer={type:'text',part:{text:'Final answer'}};
  assert.equal(terminalModelError([error,answer]),undefined);
  assert.equal(terminalModelError([answer,error]),error);
  assert.equal(terminalModelError([error]),error);
});

test('deployment artifacts use an explicit final JSON fence without stale fallbacks', async () => {
  const {lastJsonArtifact}=await import('./model-output.mjs');
  const artifact='Introductory explanation.\n```json\n{"compose":{"services":{}}}\n```';
  assert.deepEqual(lastJsonArtifact([text(artifact)],'compose'),{compose:{services:{}}});
  assert.equal(lastJsonArtifact([text(artifact),text('invalid latest answer')],'compose'),undefined);
  assert.equal(lastJsonArtifact([text(artifact+'\n```json\ninvalid\n```')],'compose'),undefined);
  assert.equal(lastJsonArtifact([text('Intro {"compose":{}}')],'compose'),undefined);
  assert.deepEqual(lastJsonArtifact([text(artifact+'\nKey decisions and explanation.')],'compose'),{compose:{services:{}}});
});

test('classifies truncation and missing final answers as incomplete model runs', async () => {
  const { completionProblem } = await import('./model-output.mjs');
  assert.match(completionProblem([{ type: 'step_finish', part: { reason: 'length' } }]), /token limit/);
  assert.match(completionProblem([text('Working'), { type: 'tool_use' }]), /no final answer/);
  assert.equal(completionProblem([{ type: 'tool_use' }, text('Final answer')]), undefined);
});
