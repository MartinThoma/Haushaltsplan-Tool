import { aggregate, sideTotal } from './aggregate.ts';
import { SIDES, SIDE_LABEL, codeTitle, isKnownCode, parentCode, type Section, type Side } from './master.ts';
import type { BudgetDataset } from './schema.ts';

export interface TreeNode {
  id: string;
  section: Section;
  side: Side;
  /** Gruppierungsziffer; null for the side total ("Einnahmen" / "Ausgaben"). */
  code: string | null;
  /** 0 for the side total, otherwise the number of digits of the code. */
  depth: number;
  title: string;
  known: boolean;
  /** Amount in € per dataset, in the order the datasets were passed; null = no entry. */
  values: (number | null)[];
  /** Per dataset: the stated total disagrees with the sum of its parts. */
  mismatch: boolean[];
  children: TreeNode[];
}

export interface SectionTree {
  section: Section;
  sides: TreeNode[];
}

export function buildTree(datasets: readonly BudgetDataset[], sections: readonly Section[]): SectionTree[] {
  return sections.map((section) => ({
    section,
    sides: SIDES.map((side) => buildSide(datasets, section, side)),
  }));
}

function buildSide(datasets: readonly BudgetDataset[], section: Section, side: Side): TreeNode {
  const aggregations = datasets.map((d) => aggregate(d.betraege[section][side]));
  const root: TreeNode = {
    id: `${section}.${side}`,
    section,
    side,
    code: null,
    depth: 0,
    title: SIDE_LABEL[side],
    known: true,
    values: aggregations.map(sideTotal),
    mismatch: aggregations.map(() => false),
    children: [],
  };

  const codes = new Set(aggregations.flatMap((a) => [...a.values.keys()]));
  const nodes = new Map<string, TreeNode>();
  // Lexicographic order puts every parent before its children ("0" < "00" < "000" < "01").
  for (const code of [...codes].sort()) {
    const node: TreeNode = {
      id: `${section}.${side}.${code}`,
      section,
      side,
      code,
      depth: code.length,
      title: codeTitle(code),
      known: isKnownCode(code),
      values: aggregations.map((a) => a.values.get(code) ?? null),
      mismatch: aggregations.map((a) => a.mismatches.has(code)),
      children: [],
    };
    nodes.set(code, node);
    const parent = parentCode(code);
    (parent ? nodes.get(parent)! : root).children.push(node);
  }
  return root;
}

export function* walkTree(trees: readonly SectionTree[]): Generator<TreeNode> {
  function* walk(node: TreeNode): Generator<TreeNode> {
    yield node;
    for (const child of node.children) yield* walk(child);
  }
  for (const tree of trees) for (const side of tree.sides) yield* walk(side);
}

export function findNode(trees: readonly SectionTree[], id: string): TreeNode | undefined {
  for (const node of walkTree(trees)) if (node.id === id) return node;
  return undefined;
}

/** Ids to expand so that everything down to `level` digits is visible (0 = side totals only). */
export function expansionForLevel(trees: readonly SectionTree[], level: number): Set<string> {
  const ids = new Set<string>();
  for (const node of walkTree(trees)) {
    if (node.depth < level && node.children.length > 0) ids.add(node.id);
  }
  return ids;
}

export type RowItem =
  | { type: 'section'; section: Section }
  | { type: 'node'; node: TreeNode; expanded: boolean; expandable: boolean; match: boolean };

const normalize = (s: string) =>
  s
    .toLocaleLowerCase('de-DE')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ß/g, 'ss');

export function makeMatcher(query: string): ((node: TreeNode) => boolean) | null {
  const q = normalize(query.trim());
  if (!q) return null;
  if (/^\d+$/.test(q)) return (node) => node.code?.startsWith(q) ?? false;
  return (node) => node.code !== null && normalize(node.title).includes(q);
}

/**
 * Flattens the trees into the rows currently on screen. While searching (FR-4.4), only
 * matches and their ancestors are shown and those ancestors are expanded automatically;
 * a matching row can still be expanded by hand to reveal everything below it.
 */
export function visibleRows(trees: readonly SectionTree[], expanded: ReadonlySet<string>, query: string): RowItem[] {
  const matches = makeMatcher(query);
  const rows: RowItem[] = [];
  const hasMatchBelow = new Map<string, boolean>();

  function scan(node: TreeNode): boolean {
    let below = false;
    for (const child of node.children) below = scan(child) || below;
    hasMatchBelow.set(node.id, below);
    return below || (matches?.(node) ?? false);
  }

  function emit(node: TreeNode, insideMatch: boolean) {
    const match = matches?.(node) ?? false;
    const below = hasMatchBelow.get(node.id) ?? false;
    if (matches && !insideMatch && !match && !below) return;
    const forced = matches !== null && below && !insideMatch;
    const isExpanded = forced || expanded.has(node.id);
    rows.push({ type: 'node', node, expanded: isExpanded, expandable: node.children.length > 0, match });
    if (!isExpanded) return;
    for (const child of node.children) emit(child, insideMatch || (match && !forced) || !matches);
  }

  for (const tree of trees) {
    if (matches && !tree.sides.map(scan).some(Boolean)) continue;
    rows.push({ type: 'section', section: tree.section });
    for (const side of tree.sides) emit(side, false);
  }
  return rows;
}
