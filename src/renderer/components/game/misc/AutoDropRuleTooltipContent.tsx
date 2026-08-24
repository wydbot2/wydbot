import { ShieldCheckIcon, ShieldExclamationIcon } from '@heroicons/react/20/solid';
import { type FC } from 'react';
import type { AutoDropAttr, AutoDropRule } from '@shared/app-config';
import { attrLabelFull, attrPredicateValue } from '../../../lib/auto-drop-attrs';
import { getItem } from '../../../lib/item-db';
import { gradeToRarity } from '../../../lib/item-rarity';
import { SECTION_BASE, STAT_ROW_BASE } from '../ItemTooltipContent';
import { AutoDropItemChip } from './AutoDropItemChip';

interface AutoDropRuleTooltipContentProps {
  rule: AutoDropRule;
}

const SECTION_TITLE_BASE =
  'flex items-center gap-1 text-[10px] font-semibold tracking-wide uppercase';

const GroupDivider: FC<{ colorClass: string }> = ({ colorClass }) => (
  <div className="flex items-center gap-2 py-0.5" aria-hidden>
    <div className="h-px flex-1 bg-gray-700" />
    <span className={`text-[10px] font-semibold tracking-wide uppercase ${colorClass}`}>ou</span>
    <div className="h-px flex-1 bg-gray-700" />
  </div>
);

const PredicateRow: FC<{ attr: AutoDropAttr }> = ({ attr }) => (
  <div className={`${STAT_ROW_BASE} text-gray-300`}>
    <span className="min-w-0 flex-auto">{attrLabelFull(attr.index)}</span>
    <span className="flex-none font-mono tabular-nums">{attrPredicateValue(attr)}</span>
  </div>
);

interface GroupSectionProps {
  title: string;
  icon: FC<{ className?: string }>;
  colorClass: string;
  groups: AutoDropAttr[][];
}

/** One side of the rule (drop or keep) — OR of AND groups, stat-row layout. */
const GroupSection: FC<GroupSectionProps> = ({ title, icon: Icon, colorClass, groups }) => (
  <div className={SECTION_BASE}>
    <div className={`${SECTION_TITLE_BASE} text-gray-500`}>
      <Icon className={`h-3.5 w-3.5 ${colorClass}`} />
      {title}
    </div>
    {groups.map((g, i) => (
      <div key={i} className="space-y-0.5">
        {i > 0 && <GroupDivider colorClass={colorClass} />}
        {g.map((a, j) => (
          <PredicateRow key={j} attr={a} />
        ))}
      </div>
    ))}
  </div>
);

export const AutoDropRuleTooltipContent: FC<AutoDropRuleTooltipContentProps> = ({ rule }) => {
  const item = getItem(rule.itemId);
  const name = item?.name ?? `Item #${rule.itemId}`;
  const rarity = item ? gradeToRarity(item.grade) : 'common';
  const dropCount = rule.dropGroups.reduce((n, g) => n + g.length, 0);
  const keepGroups = rule.keepGroups ?? [];

  return (
    <div>
      <div className="flex items-center gap-2 px-3.5 pt-3 pb-2.5">
        <AutoDropItemChip itemId={rule.itemId} rarity={rarity} size={28} />
        <span className="min-w-0 flex-auto truncate text-base font-semibold tracking-[-0.01em] text-gray-100">
          {name}
        </span>
        <span className="flex-none font-mono text-sm text-gray-500 tabular-nums">
          #{rule.itemId}
        </span>
      </div>

      {dropCount > 0 && (
        <GroupSection
          title="Descarta se"
          icon={ShieldExclamationIcon}
          colorClass="text-red-400"
          groups={rule.dropGroups}
        />
      )}
      {keepGroups.length > 0 && (
        <GroupSection
          title="Nunca descarta se"
          icon={ShieldCheckIcon}
          colorClass="text-emerald-400"
          groups={keepGroups}
        />
      )}
    </div>
  );
};
