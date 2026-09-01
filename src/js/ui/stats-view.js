/**
 * Statistics dashboard rendering: the four summary figures and the guess
 * distribution chart.
 */
import { MAX_GUESSES, MODE } from '../config.js';
import { distributionPeak, winPercentage } from '../stats.js';

/**
 * @param {HTMLElement} root
 * @param {object} stats
 * @param {{mode: string, highlightRow?: number|null}} options
 */
export function renderStats(root, stats, { mode, highlightRow = null }) {
  root.textContent = '';

  const summary = document.createElement('dl');
  summary.className = 'stats__summary';
  const figures = [
    ['Played', stats.played],
    ['Win %', winPercentage(stats)],
    ['Current streak', stats.currentStreak],
    ['Max streak', stats.maxStreak],
  ];
  for (const [label, value] of figures) {
    const cell = document.createElement('div');
    cell.className = 'stats__figure';
    const dd = document.createElement('dd');
    dd.className = 'stats__value';
    dd.textContent = String(value);
    const dt = document.createElement('dt');
    dt.className = 'stats__label';
    dt.textContent = label;
    cell.append(dd, dt);
    summary.append(cell);
  }

  const heading = document.createElement('h3');
  heading.className = 'stats__heading';
  heading.textContent = 'Guess distribution';

  const chart = document.createElement('div');
  chart.className = 'stats__chart';
  const wins = stats.wins;

  if (wins === 0) {
    const empty = document.createElement('p');
    empty.className = 'stats__empty';
    empty.textContent = mode === MODE.DAILY
      ? 'Solve today’s puzzle to start your streak.'
      : 'Win a practice round to fill this in.';
    chart.append(empty);
  } else {
    const peak = distributionPeak(stats);
    for (let i = 0; i < MAX_GUESSES; i += 1) {
      const count = stats.distribution[i];
      const row = document.createElement('div');
      row.className = 'stats__bar-row';

      const label = document.createElement('span');
      label.className = 'stats__bar-label';
      label.textContent = String(i + 1);

      const track = document.createElement('div');
      track.className = 'stats__bar-track';
      const bar = document.createElement('div');
      bar.className = 'stats__bar';
      if (highlightRow === i + 1) bar.classList.add('stats__bar--current');
      bar.style.width = `${Math.max(count === 0 ? 0 : 8, (count / peak) * 100)}%`;
      const value = document.createElement('span');
      value.className = 'stats__bar-value';
      value.textContent = String(count);
      bar.append(value);
      track.append(bar);

      row.append(label, track);
      row.setAttribute('aria-label', `${count} ${count === 1 ? 'win' : 'wins'} in ${i + 1} ${i === 0 ? 'guess' : 'guesses'}`);
      chart.append(row);
    }
  }

  root.append(summary, heading, chart);
}

/** Format a millisecond duration as HH:MM:SS. */
export function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
}
