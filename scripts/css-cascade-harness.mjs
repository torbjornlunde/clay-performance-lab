import postcss from 'postcss';

function mediaMatches(params, width) {
  const max = params.match(/max-width:\s*(\d+)px/);
  const min = params.match(/min-width:\s*(\d+)px/);
  return (!max || width <= Number(max[1])) && (!min || width >= Number(min[1]));
}

function selectorMatches(selector, className, theme) {
  if (selector.includes('html[data-theme="light"]') && theme !== 'light') return false;
  if (selector.includes('html[data-theme="dark"]') && theme !== 'dark') return false;
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\.${escaped}(?![a-zA-Z0-9_-])`).test(selector);
}

function specificity(selector) {
  return (selector.match(/#[\w-]+/g) ?? []).length * 100
    + (selector.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+/g) ?? []).length * 10
    + (selector.match(/(^|[\s>+~,])(?:html|body|[a-z][\w-]*)/gi) ?? []).length;
}

export function themeVariables(css, theme) {
  const variables = {};
  const root = postcss.parse(css);
  root.walkRules((rule) => {
    const isRoot = rule.selectors?.some((selector) => selector.trim() === ':root');
    const isTheme = rule.selectors?.some((selector) => selector.trim() === `html[data-theme="${theme}"]`);
    if (!isRoot && !isTheme) return;
    rule.walkDecls(/^--/, (declaration) => { variables[declaration.prop] = declaration.value; });
  });
  return variables;
}

export function resolveCssVariables(value, variables) {
  let resolved = value;
  for (let pass = 0; pass < 12 && resolved.includes('var('); pass += 1) {
    resolved = resolved.replace(/var\((--[\w-]+)(?:,\s*([^()]+))?\)/g, (match, name, fallback) => variables[name] ?? fallback ?? match);
  }
  return resolved;
}

// A deliberately small computed-style harness for static smoke tests. It parses
// real CSS, applies theme selectors, media queries, specificity and source order,
// then resolves custom properties for one representative class at a time.
export function computedClassStyle(css, { className, theme, width }) {
  const root = postcss.parse(css);
  const winners = new Map();
  let order = 0;
  root.walkRules((rule) => {
    order += 1;
    for (let parent = rule.parent; parent; parent = parent.parent) {
      if (parent.type === 'atrule' && parent.name === 'media' && !mediaMatches(parent.params, width)) return;
    }
    for (const selector of rule.selectors ?? []) {
      if (!selectorMatches(selector, className, theme)) continue;
      const score = specificity(selector);
      rule.nodes.filter((node) => node.type === 'decl').forEach((declaration) => {
        const previous = winners.get(declaration.prop);
        if (!previous || score > previous.score || (score === previous.score && order >= previous.order)) {
          winners.set(declaration.prop, { value: declaration.value, score, order });
        }
      });
    }
  });
  const variables = themeVariables(css, theme);
  return Object.fromEntries([...winners].map(([property, winner]) => [property, resolveCssVariables(winner.value, variables)]));
}
