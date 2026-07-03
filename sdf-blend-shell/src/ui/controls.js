// ============================================================
// controls.js — Stage B DOM layer: the blend-radius (uK) slider.
// Lives in ui/ per convention: DOM here, canvas in render/, never mixed.
// ============================================================

import { BLEND_K, K_MIN, K_MAX, K_STEP } from '../config.js';

export function createControls(material) {
  const wrap = document.getElementById('controls');
  if (!wrap) return; // graceful: missing container (or headless test) = no slider, no crash

  const label = document.createElement('label');
  label.textContent = 'blend k ';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = K_MIN;
  slider.max = K_MAX;
  slider.step = K_STEP;
  slider.value = BLEND_K;

  const readout = document.createElement('span');
  readout.textContent = Number(BLEND_K).toFixed(2);

  slider.addEventListener('input', () => {
    const k = parseFloat(slider.value);
    material.uniforms.uK.value = k; // uniforms update live; no rebuild needed
    readout.textContent = k.toFixed(2);
  });

  label.appendChild(slider);
  label.appendChild(readout);
  wrap.appendChild(label);
}
