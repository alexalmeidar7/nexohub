(function () {
  if (window.__nexoTvRemote) return;
  window.__nexoTvRemote = true;
  document.documentElement.dataset.tvApp = "true";
  // The Player owns its layout. This only supplies keyboard focus where a web
  // screen has no custom arrow handler; it never scales or recreates the UI.
  var selector = 'button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"]),[data-tv-focusable]';
  function nodes() {
    var dialogs = Array.from(document.querySelectorAll('[role="dialog"],[aria-modal="true"]'));
    var visible = function (el) {
      var r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && !el.disabled && !el.closest('[aria-hidden="true"],[inert]') && getComputedStyle(el).visibility !== 'hidden';
    };
    var scope = dialogs.filter(visible).pop() || document;
    return Array.from(scope.querySelectorAll(selector)).filter(visible);
  }
  function ensureFocus() {
    if (!document.activeElement || document.activeElement === document.body || !document.activeElement.isConnected) {
      var first = nodes()[0];
      if (first) first.focus({ preventScroll: true });
    }
  }
  var scheduled = false;
  new MutationObserver(function () {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () { scheduled = false; ensureFocus(); });
  }).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('keydown', function (event) {
    if (!/^Arrow(Up|Down|Left|Right)$/.test(event.key)) return;
    setTimeout(function () {
      if (event.defaultPrevented || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
      var active = document.activeElement;
      var a = active.getBoundingClientRect();
      var x = a.left + a.width / 2, y = a.top + a.height / 2;
      var best, score = Infinity;
      nodes().forEach(function (el) {
        if (el === active) return;
        var r = el.getBoundingClientRect(), dx = r.left + r.width / 2 - x, dy = r.top + r.height / 2 - y;
        var horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
        var primary = horizontal ? dx : dy, cross = horizontal ? Math.abs(dy) : Math.abs(dx);
        if ((event.key === 'ArrowLeft' || event.key === 'ArrowUp') ? primary >= -4 : primary <= 4) return;
        var nextScore = Math.abs(primary) + cross * 2.2;
        if (nextScore < score) { best = el; score = nextScore; }
      });
      if (best) { best.focus({ preventScroll: true }); best.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); }
    }, 0);
  });
  ensureFocus();
})();
