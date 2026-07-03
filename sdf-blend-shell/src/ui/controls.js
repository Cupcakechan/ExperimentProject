// ============================================================
// controls.js — DOM layer: the blend-radius slider (now driving
// EVERY actor via the onK callback). The creature switcher is
// gone — the field shows everyone at once.
// ============================================================

import { K_MIN, K_MAX, K_STEP } from '../config.js';

export function createControls({ initialK, onK }) {
  const wrap = document.getElementById('controls');
  if (!wrap) return null; // graceful: missing container (or headless test)

  const label = document.createElement('label');
  label.textContent = 'blend k ';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = K_MIN;
  slider.max = K_MAX;
  slider.step = K_STEP;
  slider.value = initialK;
  const readout = document.createElement('span');
  readout.textContent = Number(initialK).toFixed(2);
  slider.addEventListener('input', () => {
    const k = parseFloat(slider.value);
    onK(k);
    readout.textContent = k.toFixed(2);
  });
  label.appendChild(slider);
  label.appendChild(readout);
  wrap.appendChild(label);
  return null;
}
