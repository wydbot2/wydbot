import {
  InformationCircleIcon,
  LockClosedIcon,
  PlusIcon,
  ShieldCheckIcon,
  ShieldExclamationIcon,
  TrashIcon,
} from '@heroicons/react/20/solid';
import { type FC } from 'react';
import type { AutoDropAttr, AutoDropAttrOp, AutoDropRule } from '@shared/app-config';
import {
  MISC_AUTO_DROP_MAX_ATTRS_PER_GROUP,
  MISC_AUTO_DROP_MAX_GROUPS_PER_SIDE,
} from '@shared/app-config';
import {
  AUTO_DROP_ATTR_INDEXES,
  attrLabelFull,
  attrOpLabel,
  attrOpNeedsValue,
  attrShowsPercent,
} from '../../../lib/auto-drop-attrs';
import { getItem } from '../../../lib/item-db';
import { gradeToRarity } from '../../../lib/item-rarity';
import { Button } from '../../shared/Button';
import { NumberInput } from '../../shared/NumberInput';
import { Tooltip } from '../../shared/Tooltip';
import { AutoDropItemChip } from './AutoDropItemChip';

interface AutoDropRuleEditorProps {
  rule: AutoDropRule;
  dropGroups: AutoDropAttr[][];
  onDropGroupsChange: (groups: AutoDropAttr[][]) => void;
  /** Veto side — a fully-matched keep group saves the item even when a drop group matches. */
  keepGroups: AutoDropAttr[][];
  onKeepGroupsChange: (groups: AutoDropAttr[][]) => void;
  /** Item is fixed once a rule exists — show the hint only while editing, not on add. */
  isEditing?: boolean;
}

const ATTR_OPS: AutoDropAttrOp[] = ['>=', '>', '=', '<', '<=', 'absent', 'present'];

const selectCls =
  'rounded-md border border-gray-600 bg-gray-800 px-2 py-1 text-[12px] text-gray-100 focus:border-accent-500 focus:shadow-[0_0_0_1px_var(--color-accent-500)] focus:outline-none disabled:opacity-50';

interface AttrRowProps {
  attr: AutoDropAttr;
  onChange: (patch: Partial<AutoDropAttr>) => void;
  onRemove: () => void;
}

const AttrRow: FC<AttrRowProps> = ({ attr, onChange, onRemove }) => {
  const needsValue = attrOpNeedsValue(attr.op);
  const isPercent = needsValue && attrShowsPercent(attr.index);
  return (
    <div className="flex items-center gap-1.5">
      <select
        value={attr.index}
        onChange={(e) => onChange({ index: Number(e.target.value) })}
        className={`${selectCls} min-w-0 flex-1`}
      >
        {AUTO_DROP_ATTR_INDEXES.map((idx) => (
          <option key={idx} value={idx}>
            {attrLabelFull(idx)}
          </option>
        ))}
      </select>
      <select
        value={attr.op}
        onChange={(e) => onChange({ op: e.target.value as AutoDropAttrOp })}
        className={`${selectCls} w-24 shrink-0 text-center font-mono`}
      >
        {ATTR_OPS.map((op) => (
          <option key={op} value={op}>
            {attrOpLabel(op)}
          </option>
        ))}
      </select>
      <div
        className="flex w-20 shrink-0 items-center gap-0.5"
        aria-label={isPercent ? 'Valor em porcentagem (como no tooltip)' : undefined}
      >
        {needsValue && (
          <>
            <div className="min-w-0 flex-1">
              <NumberInput
                value={attr.value}
                min={-999}
                max={9999}
                onChange={(value) => onChange({ value })}
              />
            </div>
            {isPercent && (
              <span className="shrink-0 text-[11px] font-medium text-gray-500" aria-hidden>
                %
              </span>
            )}
          </>
        )}
      </div>
      <Button
        variant="ghost-danger"
        size="icon-xs"
        onClick={onRemove}
        aria-label="Remover atributo"
      >
        <TrashIcon className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
};

const DEFAULT_ATTR_INDEX = AUTO_DROP_ATTR_INDEXES[0];

type GroupAccent = 'drop' | 'keep';

const GROUP_CARD_BORDER: Record<GroupAccent, string> = {
  drop: 'border-red-400/20',
  keep: 'border-emerald-400/20',
};

interface AttrGroupCardProps {
  index: number;
  accent: GroupAccent;
  group: AutoDropAttr[];
  onChange: (group: AutoDropAttr[]) => void;
  onRemove: () => void;
}

/** One AND group — the card boundary IS the "E". */
const AttrGroupCard: FC<AttrGroupCardProps> = ({ index, accent, group, onChange, onRemove }) => {
  const atAttrLimit = group.length >= MISC_AUTO_DROP_MAX_ATTRS_PER_GROUP;

  const addAttr = (): void =>
    onChange([...group, { index: DEFAULT_ATTR_INDEX, op: '>=', value: 1 }]);

  const updateAttr = (i: number, patch: Partial<AutoDropAttr>): void =>
    onChange(group.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  const removeAttr = (i: number): void => onChange(group.filter((_, j) => j !== i));

  return (
    <div
      className={`flex flex-col gap-1.5 rounded-md border bg-gray-900/60 p-2 ${GROUP_CARD_BORDER[accent]}`}
    >
      <div className="-mx-2 flex items-center justify-between gap-2 border-b border-gray-700/60 px-2 pb-1.5">
        <span className="text-[11px] font-medium text-gray-500">Grupo {index + 1}</span>
        <Button
          variant="ghost-danger"
          size="icon-xs"
          onClick={onRemove}
          aria-label={`Remover grupo ${index + 1}`}
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </Button>
      </div>

      {group.map((a, i) => (
        <div key={i} className="flex flex-col gap-1">
          {i > 0 && (
            <span
              className="self-start pl-1 text-[10px] font-semibold tracking-wide text-accent-400/80 uppercase"
              aria-hidden
            >
              e
            </span>
          )}
          <AttrRow
            attr={a}
            onChange={(patch) => updateAttr(i, patch)}
            onRemove={() => removeAttr(i)}
          />
        </div>
      ))}

      <button
        type="button"
        onClick={addAttr}
        disabled={atAttrLimit}
        className="inline-flex items-center gap-1 self-start text-[11px] font-medium text-accent-400/80 transition-colors hover:text-accent-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <PlusIcon className="h-3 w-3" /> adicionar atributo
      </button>
    </div>
  );
};

const OR_DIVIDER_COLOR: Record<GroupAccent, string> = {
  drop: 'text-red-400/80',
  keep: 'text-emerald-400/80',
};

/** Space between cards IS the "OU". */
const OrDivider: FC<{ accent: GroupAccent }> = ({ accent }) => (
  <div className="flex items-center gap-2" aria-hidden>
    <div className="h-px flex-1 bg-gray-700" />
    <span
      className={`text-[10px] font-semibold tracking-wide uppercase ${OR_DIVIDER_COLOR[accent]}`}
    >
      ou
    </span>
    <div className="h-px flex-1 bg-gray-700" />
  </div>
);

interface AttrGroupListProps {
  label: string;
  tooltip: string;
  accent: GroupAccent;
  groups: AutoDropAttr[][];
  onChange: (groups: AutoDropAttr[][]) => void;
}

/** One side of the rule (drop or keep): OR of AND groups. */
const AttrGroupList: FC<AttrGroupListProps> = ({ label, tooltip, accent, groups, onChange }) => {
  const atGroupLimit = groups.length >= MISC_AUTO_DROP_MAX_GROUPS_PER_SIDE;

  const updateGroup = (i: number, group: AutoDropAttr[]): void =>
    onChange(groups.map((g, j) => (j === i ? group : g)));

  const removeGroup = (i: number): void => onChange(groups.filter((_, j) => j !== i));

  const addGroup = (): void =>
    onChange([...groups, [{ index: DEFAULT_ATTR_INDEX, op: '>=', value: 1 }]]);

  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        {accent === 'drop' && (
          <ShieldExclamationIcon className="h-3.5 w-3.5 text-red-400" aria-hidden />
        )}
        {accent === 'keep' && (
          <ShieldCheckIcon className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
        )}
        <label className="text-[12px] font-medium text-gray-400">{label}</label>
        <Tooltip content={tooltip} placement="top">
          <InformationCircleIcon className="h-3.5 w-3.5 cursor-help text-gray-500" aria-hidden />
        </Tooltip>
      </div>

      {groups.map((g, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          {i > 0 && <OrDivider accent={accent} />}
          <AttrGroupCard
            index={i}
            accent={accent}
            group={g}
            onChange={(group) => updateGroup(i, group)}
            onRemove={() => removeGroup(i)}
          />
        </div>
      ))}

      <button
        type="button"
        onClick={addGroup}
        disabled={atGroupLimit}
        className="inline-flex items-center justify-center gap-1 rounded-md border border-dashed border-gray-600/60 bg-gray-900/40 px-2 py-1.5 text-[11px] font-medium text-gray-400 transition-colors hover:border-cyan-400/60 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <PlusIcon className="h-3 w-3" /> adicionar grupo
      </button>
    </section>
  );
};

export const AutoDropRuleEditor: FC<AutoDropRuleEditorProps> = ({
  rule,
  dropGroups,
  onDropGroupsChange,
  keepGroups,
  onKeepGroupsChange,
  isEditing = false,
}) => {
  const item = getItem(rule.itemId);
  const name = item?.name ?? `Item #${rule.itemId}`;
  const rarity = item ? gradeToRarity(item.grade) : 'common';

  return (
    <div className="flex flex-col gap-3.5">
      <section className="flex flex-col gap-1.5">
        <label className="text-[12px] font-medium text-gray-400">Item</label>
        <div className="flex items-center gap-2 rounded-md border border-gray-700 bg-gray-900/60 px-1.5 py-1">
          <AutoDropItemChip itemId={rule.itemId} rarity={rarity} size={28} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13px] font-medium text-gray-100">{name}</span>
            <span className="font-mono text-[11px] text-gray-500">#{rule.itemId}</span>
          </div>
          {isEditing && (
            <span className="inline-flex shrink-0 items-center gap-1 pr-1 text-[10px] font-medium text-gray-500">
              <LockClosedIcon className="h-3 w-3" />
              não editável
            </span>
          )}
        </div>
      </section>

      <AttrGroupList
        label="Descartar quando bater"
        tooltip="Sem grupos, descarta qualquer instância do item. Dentro do grupo, todos os atributos precisam bater (E); entre grupos, basta um casar (OU)."
        accent="drop"
        groups={dropGroups}
        onChange={onDropGroupsChange}
      />

      <AttrGroupList
        label="Nunca descartar quando bater"
        tooltip="Tem prioridade: se algum grupo casar por completo, o item é mantido mesmo que um grupo de descarte case."
        accent="keep"
        groups={keepGroups}
        onChange={onKeepGroupsChange}
      />
    </div>
  );
};
