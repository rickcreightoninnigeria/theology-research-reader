// The review quiz page for one pathway: one question at a time, with feedback, a summary and a retry of the missed ones.
// The best score is kept with the reader's other data (a `quiz:<pathway>` record, so it travels in a backup).

import { MIN_QUESTIONS, grade, makeQuiz } from './review.js';
import { el, linkTo, richText } from './ui.js';

export function renderReview(ctx, id) {
  const { doc, t, data } = ctx;
  const pathway = data.pathways.get(id);
  if (pathway === undefined) return el(doc, 'section', {}, el(doc, 'h1', { id: 'page-heading', text: t('not_found') }));
  const main = el(doc, 'section', { id: 'review' });
  main.append(
    el(
      doc,
      'p',
      { class: 'crumb' },
      el(doc, 'a', {
        href: ctx.href(`/pathway/${encodeURIComponent(id)}`),
        'data-link': true,
        text: `← ${pathway.title}`,
      }),
    ),
    el(doc, 'h1', { id: 'page-heading', text: t('review_title', { title: pathway.title }) }),
  );
  const body = el(doc, 'div', { id: 'review-body' });
  main.append(body);
  const quiz = makeQuiz(pathway, data, ctx.random);
  if (quiz === null) {
    body.append(
      el(doc, 'p', { class: 'hint', id: 'review-none', text: t('review_not_enough', { min: MIN_QUESTIONS }) }),
    );
    return main;
  }
  const best = el(doc, 'p', { id: 'review-best', class: 'meta' });
  main.append(best);
  const showBest = async () => {
    const record = ctx.idb ? await ctx.idb.get('userdata', `quiz:${id}`) : null;
    best.textContent =
      record?.fields?.best !== undefined
        ? t('review_best', { best: record.fields.best, total: record.fields.total })
        : '';
  };
  showBest().catch(() => {});

  const start = (questions) => {
    const answers = {};
    let index = 0;
    const ask = () => {
      if (index >= questions.length) return finish();
      const q = questions[index];
      const form = el(doc, 'form', { id: 'review-question' });
      const fieldset = el(
        doc,
        'fieldset',
        {},
        el(doc, 'legend', { text: t('review_progress', { n: index + 1, total: questions.length }) }),
        el(doc, 'p', { id: 'review-claim' }, richText(doc, q.claim)),
        el(doc, 'p', { text: t('review_which') }),
      );
      q.options.forEach((option, i) => {
        const input = el(doc, 'input', {
          type: 'radio',
          name: 'choice',
          id: `opt-${i}`,
          value: option,
          required: true,
        });
        fieldset.append(
          el(
            doc,
            'div',
            {},
            input,
            ' ',
            el(doc, 'label', { for: `opt-${i}`, class: 'inline', text: data.titleOf(option) }),
          ),
        );
      });
      const check = el(doc, 'button', { type: 'submit', id: 'review-check', text: t('review_check') });
      form.append(fieldset, check);
      const feedback = el(doc, 'p', { id: 'review-feedback', role: 'status' });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const chosen = form.querySelector('input[name="choice"]:checked');
        if (chosen === null) return;
        answers[q.id] = chosen.value;
        const right = chosen.value === q.answer;
        feedback.replaceChildren(
          el(doc, 'strong', { text: right ? t('review_right') : t('review_wrong') }),
          ' ',
          right ? '' : [t('review_it_was'), ' '],
          right ? '' : linkTo(doc, ctx, q.answer),
        );
        feedback.dataset.result = right ? 'right' : 'wrong';
        for (const input of form.querySelectorAll('input')) input.disabled = true;
        check.remove();
        const next = el(doc, 'button', {
          type: 'button',
          id: 'review-next',
          text: index + 1 < questions.length ? t('review_next') : t('review_finish'),
        });
        next.addEventListener('click', () => {
          index += 1;
          ask();
        });
        form.append(feedback, next);
        next.focus();
      });
      body.replaceChildren(form);
      form.querySelector('input').focus();
    };
    const finish = async () => {
      const result = grade(questions, answers);
      const retry = el(doc, 'button', { type: 'button', id: 'review-retry', text: t('review_retry_missed') });
      retry.addEventListener('click', () =>
        start(questions.filter((q) => result.missed.includes(q.id)).map((q) => ({ ...q, options: [...q.options] }))),
      );
      const again = el(doc, 'button', { type: 'button', id: 'review-again', text: t('review_again') });
      again.addEventListener('click', () => start(makeQuiz(pathway, data, ctx.random)));
      body.replaceChildren(
        el(doc, 'h2', {
          id: 'review-summary',
          text: t('review_score', { correct: result.correct, total: result.total }),
        }),
        result.missed.length > 0 ? retry : el(doc, 'p', { text: t('review_all_right') }),
        ' ',
        again,
      );
      if (ctx.idb && questions.length === quiz.length) {
        const previous = (await ctx.idb.get('userdata', `quiz:${id}`))?.fields?.best ?? -1;
        if (result.correct > previous)
          await ctx.idb.setFields('userdata', `quiz:${id}`, { pathway: id, best: result.correct, total: result.total });
        await showBest();
      }
    };
    ask();
  };
  const intro = el(doc, 'p', { text: t('review_intro', { count: quiz.length }) });
  const begin = el(doc, 'button', { type: 'button', id: 'review-start', text: t('review_start') });
  begin.addEventListener('click', () => start(quiz));
  body.append(intro, begin);
  return main;
}
