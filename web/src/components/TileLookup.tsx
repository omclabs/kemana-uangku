import { useState } from 'react';
import { ChevronLeftIcon, XMarkIcon } from './icons';

export interface TileLookupItem {
  id: string;
  name: string;
  parent_id: string | null;
  is_active: number;
}

interface TileLookupProps<T extends TileLookupItem> {
  items: T[];
  value: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  // When true, a parent tile with active children shows an extra "All
  // <Parent>" tile in its child grid so the parent itself can be selected
  // (accounts: parent-or-child allowed). When false, a parent with active
  // children cannot be selected directly -- a leaf must be chosen
  // (categories: "if has child then must use child").
  allowParentSelection: boolean;
  title: string;
}

export default function TileLookup<T extends TileLookupItem>({
  items,
  value,
  onSelect,
  onClose,
  allowParentSelection,
  title,
}: TileLookupProps<T>) {
  const [drilled, setDrilled] = useState<T | null>(null);

  function childrenOf(parentId: string): T[] {
    return items.filter((item) => item.parent_id === parentId && item.is_active === 1);
  }

  function choose(id: string) {
    onSelect(id);
    onClose();
  }

  const topLevel = items.filter((item) => item.parent_id === null && item.is_active === 1);
  const children = drilled ? childrenOf(drilled.id) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2">
          {drilled && (
            <button
              type="button"
              aria-label="Back"
              onClick={() => setDrilled(null)}
              className="p-1 text-gray-500"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
          )}
          <h2 className="flex-1 truncate text-base font-semibold text-gray-900">
            {drilled ? drilled.name : title}
          </h2>
          <button type="button" aria-label="Close" onClick={onClose} className="p-1 text-gray-500">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {!drilled &&
            topLevel.map((item) => {
              const hasChildren = childrenOf(item.id).length > 0;
              return (
                <Tile
                  key={item.id}
                  label={item.name}
                  selected={item.id === value}
                  hasChildren={hasChildren}
                  onClick={() => {
                    if (hasChildren) {
                      setDrilled(item);
                    } else {
                      choose(item.id);
                    }
                  }}
                />
              );
            })}

          {drilled && allowParentSelection && (
            <Tile
              label={`All ${drilled.name}`}
              selected={drilled.id === value}
              onClick={() => choose(drilled.id)}
            />
          )}

          {drilled &&
            children.map((child) => (
              <Tile
                key={child.id}
                label={child.name}
                selected={child.id === value}
                onClick={() => choose(child.id)}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

function Tile({
  label,
  selected,
  onClick,
  hasChildren,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  hasChildren?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg p-3 text-center text-sm font-medium ${
        selected ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-900 ring-1 ring-gray-200'
      }`}
    >
      <span className="line-clamp-2">{label}</span>
      {hasChildren && <span className="mt-1 block text-xs opacity-70">›</span>}
    </button>
  );
}
