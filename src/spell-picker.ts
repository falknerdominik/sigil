import type { SpellEntry } from './spell-catalog';

interface PickerElements {
  root: HTMLElement;
  input: HTMLInputElement;
  toggle: HTMLButtonElement;
  list: HTMLElement;
  status: HTMLElement;
}

interface PickerOption {
  id: string;
  label: string;
  meta: string;
}

interface SearchRow {
  entry: SpellEntry;
  search: string;
}

/** Searchable catalogue combobox; selecting a result is owned by the editor. */
export class SpellPicker {
  private rows: SearchRow[] = [];
  private open = false;
  private options: PickerOption[] = [];
  private active = -1;

  constructor(
    private readonly elements: PickerElements,
    private readonly fieldIds: readonly (keyof SpellEntry)[],
    private readonly getSelection: () => SpellEntry | null,
    private readonly onSelect: (id: string) => void,
  ) {
    const { root, input, toggle, list } = elements;
    input.addEventListener('focus', () => {
      input.select();
      this.show('', true);
    });
    input.addEventListener('input', () => this.show(input.value));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (!this.open) this.show('', true);
        else
          this.moveActive(this.active + (event.key === 'ArrowDown' ? 1 : -1));
      } else if (event.key === 'Enter' && this.open) {
        event.preventDefault();
        if (this.active >= 0) this.choose(this.options[this.active].id);
      } else if (event.key === 'Escape' && this.open) {
        event.preventDefault();
        this.close();
      } else if (event.key === 'Tab') {
        this.close();
      }
    });
    toggle.addEventListener('click', () => {
      if (this.open) this.close();
      else {
        input.focus();
        this.show('', true);
      }
    });
    list.addEventListener('mousedown', (event) => event.preventDefault());
    list.addEventListener('click', (event) => {
      const item =
        event.target instanceof Element
          ? event.target.closest('[data-spell-id]')
          : null;
      if (item instanceof HTMLElement && item.dataset.spellId)
        this.choose(item.dataset.spellId);
    });
    root.addEventListener('focusout', (event) => {
      if (
        !(event.relatedTarget instanceof Node) ||
        !root.contains(event.relatedTarget)
      )
        this.close();
    });
    root.ownerDocument.addEventListener('pointerdown', (event) => {
      if (
        this.open &&
        (!(event.target instanceof Node) || !root.contains(event.target))
      )
        this.close();
    });
  }

  get searchRows(): readonly SearchRow[] {
    return this.rows;
  }

  refresh(entries: readonly SpellEntry[]) {
    this.rows = entries.map((entry) => ({
      entry,
      search: [
        entry.name,
        entry.rank,
        entry.rank === 'cantrip' ? 'cantrip' : `rank ${entry.rank}`,
        entry.source,
        entry.edition === 'both' ? 'both remaster legacy' : entry.edition,
        entry.category,
        entry.tradition,
        entry.damage,
        entry.range,
        ...(entry.traits || []),
        ...(entry.traditions || []),
        ...this.fieldIds.map((id) => entry[id]),
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase(),
    }));
    if (this.open) this.show('');
    else this.refreshSelection();
  }

  refreshSelection() {
    this.elements.input.value =
      this.getSelection()?.name || '\u2726 Custom spell';
  }

  private close() {
    this.open = false;
    this.options = [];
    this.active = -1;
    const { input, toggle, list, status } = this.elements;
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-expanded', 'false');
    list.replaceChildren();
    input.removeAttribute('aria-activedescendant');
    this.refreshSelection();
    status.textContent = '';
  }

  private moveActive(index: number) {
    if (!this.options.length) return;
    this.active = (index + this.options.length) % this.options.length;
    const items = this.elements.list.querySelectorAll('[role="option"]');
    items.forEach((item, i) =>
      item.classList.toggle('is-active', i === this.active),
    );
    const active = items[this.active];
    this.elements.input.setAttribute('aria-activedescendant', active.id);
    active.scrollIntoView({ block: 'nearest' });
  }

  private show(query = '', focusSelected = false) {
    this.open = true;
    const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    const matching = this.rows.filter((row) =>
      terms.every((term) => row.search.includes(term)),
    );
    const canChooseCustom =
      !terms.length || terms.every((term) => 'custom spell'.includes(term));
    this.options = [
      ...(canChooseCustom
        ? [{ id: 'custom', label: '\u2726 Custom spell', meta: 'New spell' }]
        : []),
      ...matching.map(({ entry }) => {
        const rank =
          entry.rank === 'cantrip' ? 'cantrip' : `rank ${entry.rank}`;
        const edition =
          entry.edition === 'both'
            ? 'Both editions'
            : entry.edition === 'legacy'
              ? 'Legacy'
              : 'Remaster';
        return {
          id: entry.id,
          label: entry.name,
          meta: `${edition} | ${rank}${entry.source ? ' | ' + entry.source : ''}`,
        };
      }),
    ];
    const { input, toggle, list, status } = this.elements;
    const selected = this.getSelection();
    const fragment = list.ownerDocument.createDocumentFragment();
    this.options.forEach((option, index) => {
      const item = list.ownerDocument.createElement('button');
      item.type = 'button';
      item.className = 'spell-picker-option';
      item.id = `spell-picker-option-${index}`;
      item.setAttribute('role', 'option');
      item.setAttribute(
        'aria-selected',
        String(selected ? selected.id === option.id : option.id === 'custom'),
      );
      item.dataset.spellId = option.id;
      const name = list.ownerDocument.createElement('span');
      name.textContent = option.label;
      const meta = list.ownerDocument.createElement('span');
      meta.className = 'spell-option-meta';
      meta.textContent = option.meta;
      item.append(name, meta);
      fragment.appendChild(item);
    });
    if (!this.options.length) {
      const empty = list.ownerDocument.createElement('div');
      empty.className = 'spell-picker-empty';
      empty.textContent = 'No matching spells. Try a shorter search.';
      fragment.appendChild(empty);
    }
    list.replaceChildren(fragment);
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-expanded', 'true');
    status.textContent = `${matching.length.toLocaleString()} match${matching.length === 1 ? '' : 'es'}`;
    let active = 0;
    if (focusSelected && selected) {
      const selectedIndex = this.options.findIndex(
        (option) => option.id === selected.id,
      );
      if (selectedIndex >= 0) active = selectedIndex;
    }
    this.active = -1;
    input.removeAttribute('aria-activedescendant');
    if (this.options.length) this.moveActive(active);
  }

  private choose(id: string) {
    this.close();
    this.onSelect(id);
  }
}
