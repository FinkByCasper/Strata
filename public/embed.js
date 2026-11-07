/*
 * Strata embed loader. Add it once after your <iframe data-strata-embed ...> tags:
 *   <script src="https://YOUR-STRATA/embed.js" async></script>
 * Each frame reports the shape its diagram would like to have, and this script sets the frame's height from its width, also when the
 * page is resized. Put data-ratio="16/9" on an iframe to choose a shape yourself. Without this script the iframe keeps its own height.
 */
(function () {
  'use strict';
  var MAX_SCREENS = 0.85;
  var ratios = new WeakMap();

  function frames() { return Array.prototype.slice.call(document.querySelectorAll('iframe[data-strata-embed]')); }

  function chosen(frame) {
    var parts = String(frame.getAttribute('data-ratio') || '').split('/');
    var w = parseFloat(parts[0]), h = parts.length > 1 ? parseFloat(parts[1]) : 1;
    return w > 0 && h > 0 ? w / h : null;
  }

  function fit(frame) {
    var ratio = chosen(frame) || ratios.get(frame);
    if (!ratio) return;
    var height = Math.round(frame.getBoundingClientRect().width / ratio);
    frame.style.height = Math.max(160, Math.min(height, Math.round(window.innerHeight * MAX_SCREENS))) + 'px';
  }

  function hello(frame) {
    if (frame.contentWindow) frame.contentWindow.postMessage({ strata: 'embed-hello' }, '*');
  }

  window.addEventListener('message', function (e) {
    var data = e.data;
    if (!data || data.strata !== 'embed-size' || typeof data.ratio !== 'number' || !(data.ratio > 0)) return;
    frames().forEach(function (frame) {
      if (frame.contentWindow !== e.source) return;
      ratios.set(frame, data.ratio);
      fit(frame);
    });
  });

  // A column can change width without the window changing (a sidebar opens), so each frame is watched too. Only a change of width
  // matters; setting the height must not set this off again.
  var widths = new WeakMap();
  var watcher = window.ResizeObserver && new ResizeObserver(function (entries) {
    entries.forEach(function (entry) {
      var width = Math.round(entry.contentRect.width);
      if (widths.get(entry.target) === width) return;
      widths.set(entry.target, width);
      fit(entry.target);
    });
  });

  var timer;
  window.addEventListener('resize', function () {
    clearTimeout(timer);
    timer = setTimeout(function () { frames().forEach(fit); }, 60);
  });

  function start() {
    frames().forEach(function (frame) {
      fit(frame);
      hello(frame);
      if (watcher) watcher.observe(frame);
      frame.addEventListener('load', function () { hello(frame); });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
