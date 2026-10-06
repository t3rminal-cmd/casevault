// v1.59: forms start folded; the old regression scripts expect them open. Open each as it appears.
module.exports = (p) => p.addInitScript(() => {
  const seen = new WeakSet();
  const go = () => document.querySelectorAll('.fold-btn[aria-expanded="false"], .rf-fold[aria-expanded="false"]').forEach((b) => { if (!seen.has(b) && !b.disabled) { seen.add(b); b.click(); } });
  new MutationObserver(go).observe(document, { childList: true, subtree: true });
});
