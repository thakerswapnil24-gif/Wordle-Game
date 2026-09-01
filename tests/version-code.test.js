import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

/**
 * Play version codes are permanent: a code that has been uploaded can never be
 * reused, and the store rejects a release whose code does not exceed the last
 * one. A mistake here cannot be fixed by a later release, so the derivation is
 * tested rather than trusted.
 */

function derive(tag) {
  return execFileSync('tools/version-code.sh', [tag], { encoding: 'utf8' }).trim();
}

function fails(tag) {
  try {
    execFileSync('tools/version-code.sh', [tag], { encoding: 'utf8', stdio: 'pipe' });
    return null;
  } catch (error) {
    return String(error.stderr);
  }
}

test('a release tag maps to a name and a version code', () => {
  assert.equal(derive('v1.0.0'), '1.0.0 10000');
  assert.equal(derive('v1.2.3'), '1.2.3 10203');
  assert.equal(derive('v0.9.1'), '0.9.1 901');
  assert.equal(derive('v2.10.7'), '2.10.7 21007');
});

test('the leading v is optional', () => {
  assert.equal(derive('1.4.2'), '1.4.2 10402');
});

test('version codes increase with the version', () => {
  const order = ['v0.0.1', 'v0.1.0', 'v0.9.99', 'v1.0.0', 'v1.0.1', 'v1.1.0', 'v2.0.0'];
  const codes = order.map((tag) => Number(derive(tag).split(' ')[1]));
  const sorted = [...codes].sort((a, b) => a - b);
  assert.deepEqual(codes, sorted, `codes out of order: ${codes}`);
  assert.equal(new Set(codes).size, codes.length, 'codes must be unique');
});

test('a component of 100 or more is rejected rather than colliding', () => {
  // v1.0.100 and v1.1.0 would both produce 10100. Play would reject the second
  // upload as a duplicate, with nothing in the build to explain why.
  assert.match(fails('v1.0.100'), /below 100/);
  assert.match(fails('v1.100.0'), /below 100/);
  assert.equal(derive('v1.0.99').split(' ')[1], '10099');
  assert.equal(derive('v1.99.0').split(' ')[1], '19900');
});

test('a zero-padded component is read as decimal, not octal', () => {
  // Bash arithmetic treats 09 as octal and errors out; 10# prevents that.
  assert.equal(derive('v1.2.09'), '1.2.09 10209');
  assert.equal(derive('v1.08.0'), '1.08.0 10800');
});

test('a malformed tag fails loudly instead of guessing', () => {
  for (const tag of ['v1.2.3-beta', 'v1.2', 'v1', 'vX.Y.Z', 'release-1.2.3', 'v1.2.3.4']) {
    assert.match(fails(tag) ?? '', /must look like/, `${tag} should be rejected`);
  }
});

test('a zero version code is rejected', () => {
  // Play requires a positive integer.
  assert.match(fails('v0.0.0'), /must be positive/);
});

test('no argument prints usage rather than emitting a bogus code', () => {
  assert.match(fails(''), /usage/);
});
