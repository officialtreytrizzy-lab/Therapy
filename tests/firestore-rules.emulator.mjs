import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const projectId = 'demo-us-for-real-therapy';
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'users/alice'), {
      displayName: 'Alice',
      pronouns: 'she/her',
      coupleId: 'couple-1',
      onboardingComplete: true,
    });
    await setDoc(doc(db, 'users/bob'), {
      displayName: 'Bob',
      pronouns: 'he/him',
      coupleId: 'couple-1',
      onboardingComplete: true,
    });
    await setDoc(doc(db, 'users/mallory'), {
      displayName: 'Mallory',
      pronouns: 'they/them',
      coupleId: null,
      onboardingComplete: true,
    });
    await setDoc(doc(db, 'couples/couple-1'), {
      memberUids: ['alice', 'bob'],
      status: 'active',
    });
    await setDoc(doc(db, 'couples/couple-1/goals/goal-1'), { title: 'Listen better' });
    await setDoc(doc(db, 'users/alice/privateInteractions/private-1'), { kind: 'reflection' });
    await setDoc(doc(db, 'memberDirectory/12345678'), { uid: 'alice' });
  });
});

after(async () => {
  await env?.cleanup();
});

test('unauthenticated clients cannot read user or couple records', async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, 'users/alice')));
  await assertFails(getDoc(doc(db, 'couples/couple-1')));
});

test('a signed-in member can read only their own user document', async () => {
  const db = env.authenticatedContext('alice').firestore();
  const own = await assertSucceeds(getDoc(doc(db, 'users/alice')));
  assert.equal(own.data()?.displayName, 'Alice');
  await assertFails(getDoc(doc(db, 'users/bob')));
});

test('private interaction records remain isolated to their owner', async () => {
  const alice = env.authenticatedContext('alice').firestore();
  const bob = env.authenticatedContext('bob').firestore();
  await assertSucceeds(getDoc(doc(alice, 'users/alice/privateInteractions/private-1')));
  await assertFails(getDoc(doc(bob, 'users/alice/privateInteractions/private-1')));
});

test('linked members can read shared records and outsiders cannot', async () => {
  const alice = env.authenticatedContext('alice').firestore();
  const mallory = env.authenticatedContext('mallory').firestore();
  await assertSucceeds(getDoc(doc(alice, 'couples/couple-1/goals/goal-1')));
  await assertFails(getDoc(doc(mallory, 'couples/couple-1/goals/goal-1')));
});

test('browser clients cannot write server-owned shared or directory records', async () => {
  const alice = env.authenticatedContext('alice').firestore();
  await assertFails(setDoc(doc(alice, 'couples/couple-1/goals/goal-2'), { title: 'Unsafe direct write' }));
  await assertFails(setDoc(doc(alice, 'memberDirectory/87654321'), { uid: 'alice' }));
});

test('profile updates allow only the explicit safe-field allowlist', async () => {
  const alice = env.authenticatedContext('alice').firestore();
  await assertSucceeds(updateDoc(doc(alice, 'users/alice'), { displayName: 'Alice A.' }));
  await assertFails(updateDoc(doc(alice, 'users/alice'), { coupleId: 'attacker-controlled' }));
  await assertFails(updateDoc(doc(alice, 'users/alice'), { memberCode: '00000000' }));
});
