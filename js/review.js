// The review quiz for a pathway (stage 9, Desirable; ported in spirit from the Bible Study Reader's review module). A pure half: build
// the question pool from the pathway's records, pick the answer options, grade. The page half is in review-ui.js.
//
// A question shows one main claim from a step's record and asks which of the pathway's records it comes from. The options are the
// right record and up to three other records of the same pathway, shuffled. A record with no public claims (a listed-only source)
// gives no question, so a quiz only ever asks about text the reader can see.

export const OPTION_COUNT = 4;
export const MIN_QUESTIONS = 2;

/** Questions for a pathway: { id, claim, claimId, answer } for the first claim of each step's record, in step order. */
export function buildPool(pathway, data) {
  const pool = [];
  const seen = new Set();
  for (const step of pathway.steps) {
    const found = data.resolve(step.record);
    if (found === null || !['record', 'source'].includes(found.kind) || seen.has(step.record)) continue;
    const claim = data.claimsOf(step.record)[0];
    if (claim === undefined) continue;
    seen.add(step.record);
    pool.push({ id: `q-${pool.length + 1}`, claim: claim.text, claimId: claim.id, answer: step.record });
  }
  return pool;
}

/** A small seeded random generator, so a quiz can be repeated in tests. Returns numbers in [0, 1). */
export function seeded(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Fisher–Yates shuffle with the given generator. */
export function shuffle(list, rng = Math.random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The answer options for a question: the right record plus up to OPTION_COUNT - 1 others from the pool, shuffled. */
export function pickOptions(question, pool, rng = Math.random, count = OPTION_COUNT) {
  const others = shuffle(
    pool.filter((q) => q.answer !== question.answer).map((q) => q.answer),
    rng,
  ).slice(0, count - 1);
  return shuffle([question.answer, ...others], rng);
}

/** A quiz: the questions in a random order, each with its options. `count` limits the number of questions. */
export function makeQuiz(pathway, data, rng = Math.random, count = Infinity) {
  const pool = buildPool(pathway, data);
  if (pool.length < MIN_QUESTIONS) return null;
  return shuffle(pool, rng)
    .slice(0, count)
    .map((q) => ({ ...q, options: pickOptions(q, pool, rng) }));
}

/** Score: `answers` maps a question id to the chosen option. Returns { correct, total, missed: [question ids] }. */
export function grade(quiz, answers) {
  const missed = quiz.filter((q) => answers[q.id] !== q.answer).map((q) => q.id);
  return { correct: quiz.length - missed.length, total: quiz.length, missed };
}
