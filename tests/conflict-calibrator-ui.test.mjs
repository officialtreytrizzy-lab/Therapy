import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/experience-polish.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/experience-polish.css', import.meta.url), 'utf8');
const index = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('conflict calibrator is available as a solo private route', () => {
  assert.match(source, /\/calibrate/);
  assert.match(source, /No partner connection required/);
  assert.match(source, /private:true/);
});

test('calibrator requires three reasons for both perspectives', () => {
  assert.match(source, /Give three reasons you are right/);
  assert.match(source, /Give three reasons .* could be right/);
  assert.match(source, /reasonCount\(calibration\.yourReasons\)!==3/);
  assert.match(source, /reasonCount\(calibration\.theirReasons\)!==3/);
});

test('one-minute self-side timeout produces a cool-off bias warning', () => {
  assert.match(source, /60-Math\.floor/);
  assert.match(source, /creating a bias that makes the full situation harder to see/);
  assert.match(source, /Cool off before you act/);
});

test('mobile navigation replaces the hamburger with a bottom bar and sheet', () => {
  assert.match(source, /premium-tabbar/);
  assert.match(source, /app-more-sheet/);
  assert.doesNotMatch(source, /☰/);
  assert.match(css, /\.premium-tabbar/);
});

test('polish assets load after the relationship workspace', () => {
  assert.match(index, /relationship-v2\.css[\s\S]*experience-polish\.css/);
  assert.match(index, /relationship-v2\.js[\s\S]*experience-polish\.js/);
});
