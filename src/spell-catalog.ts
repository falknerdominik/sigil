import { IDENTITY_TAG, MAX_IDENTITY_BYTES, MAX_VARIANT_LENGTH, MAX_CATALOGUE_SIZE,
    TRADITIONS, CAST_ACTIONS, CAST_TRAITS, PRIMARY_TRAIT_PRIORITIES,
    DAMAGE_CATEGORIES, REMASTER_DAMAGE_CATEGORIES } from './constants';

type InputRecord = Record<string, unknown>;
export interface SpellEntry {
    id: string;
    name: string;
    variant: string;
    edition: string;
    rank: string;
    tradition: string;
    damage: string;
    area: string;
    range: string;
    spellType: string;
    castActions: string;
    defense: string;
    duration: string;
    targets: string;
    rarity: string;
    effectTrait: string;
    castTraits: string;
    heightening: string;
    source: string;
    category: string;
    traits: string[];
    traditions: string[];
    rawAction: string;
    description: string;
}
type PendingSpell = Omit<SpellEntry, 'id'> & {
    id?: string;
};
export interface ParsedCatalogue {
    entries: SpellEntry[];
    skipped: number;
    total: number;
}
function asRecord(value: unknown): InputRecord | undefined {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as InputRecord : undefined;
}
function field(value: unknown, key: string): unknown {
    return asRecord(value)?.[key];
}
/**
 * SpellCatalog: imports a local spell.json into stable, categorical PF2e
 * attributes. Supports compact app records, AoN-style rows, and Foundry
 * PF2e Item JSON. Encoded IDs are unique within each imported catalogue.
 *
 * The renderer uses nine categorical attributes selected for distinctiveness.
 * Additional parsed metadata remains available for search and analysis.
 */
export class SpellCatalog {
    static rows(payload: unknown): unknown[] {
        if (typeof payload === 'string')
            payload = JSON.parse(payload);
        if (Array.isArray(payload))
            return payload;
        const root = asRecord(payload);
        if (!root)
            throw new Error('spell.json must contain a list of spells.');
        // Accept both community spell lists and Foundry-style compendia.
        const containers = [root.spells, root.spell, root.entries, root.items,
            root.results, root.compendium, field(root.data, 'spells'), field(root.data, 'items'),
            field(root.data, 'entries'), Array.isArray(root.data) ? root.data : null];
        for (const container of containers) {
            if (Array.isArray(container))
                return container;
            if (container && typeof container === 'object')
                return Object.entries(container).map(([key, value]) => value && typeof value === 'object' ? { __objectKey: key, ...value } : value);
        }
        if (root.name && (root.type === 'spell' || root.rank !== undefined || root.level !== undefined)) {
            return [root];
        }
        // Some public compendia use a root object keyed by spell ID.
        const values = Object.entries(root).filter(([key]) => !['description', 'meta', 'version', 'source'].includes(key));
        if (values.length && values.every(([, value]) => value && typeof value === 'object' && !Array.isArray(value))) {
            return values.map(([key, value]) => {
                const record = asRecord(value);
                if (!record)
                    throw new Error('Expected keyed spell records.');
                return { __objectKey: key, ...record };
            });
        }
        throw new Error('Expected a JSON array or a spells/entries/items list (keyed spell maps also work).');
    }
    static text(value: unknown): string {
        if (typeof value === 'string' || typeof value === 'number')
            return String(value).trim();
        const record = asRecord(value);
        if (record)
            return SpellCatalog.text(record.value ?? record.label ?? record.name ?? '');
        return '';
    }
    static list(value: unknown): string[] {
        if (Array.isArray(value))
            return value.map(x => SpellCatalog.text(x)).filter(Boolean);
        const text = SpellCatalog.text(value);
        return text ? text.split(/[,;/]/).map(x => x.trim()).filter(Boolean) : [];
    }
    static edition(value: unknown): string {
        if (typeof value === 'boolean')
            return value ? 'remaster' : 'legacy';
        const x = SpellCatalog.text(value).toLowerCase();
        if (/legacy|pre.remaster|original/.test(x))
            return 'legacy';
        if (/remaster|player core|2023|2024/.test(x))
            return 'remaster';
        return 'both';
    }
    static rank(row: InputRecord, sys: InputRecord, traits: string[]): string {
        const category = SpellCatalog.text(row.category ?? sys.category ?? row.type).toLowerCase();
        if (traits.includes('cantrip') || /cantrip/.test(category) || row.isCantrip === true)
            return 'cantrip';
        let rank = SpellCatalog.text(row.rank ?? row.spellRank ?? row.level ?? sys.level ?? row.heightenedLevel);
        if (/cantrip/.test(rank.toLowerCase()))
            return 'cantrip';
        const match = rank.match(/(?:rank|level)?\s*(10|[1-9])\b/i);
        return match ? match[1] : '1';
    }
    static tradition(row: InputRecord, sys: InputRecord): string {
        // Compact imports may use the same "Arcane+Primal" form as the UI.
        const list = SpellCatalog.list(row.traditions ?? row.tradition ?? field(sys.traits, 'traditions') ?? sys.traditions)
            .flatMap(value => value.split(/\s*\+\s*/));
        const valid = [...new Set(list.map(t => t[0]?.toUpperCase() + t.slice(1).toLowerCase())
                .filter(t => TRADITIONS.includes(t)))].sort((a, b) => TRADITIONS.indexOf(a) - TRADITIONS.indexOf(b));
        // Preserve the exact subset of traditions as ONE categorical attribute.
        // Previously all multi-tradition spells collapsed into a single "multiple"
        // category, making many otherwise distinguishable spells identical.
        if (valid.length)
            return valid.join('+');
        return list.some(t => t.toLowerCase() === 'multiple') ? 'multiple' : 'none';
    }
    static damage(row: InputRecord, sys: InputRecord, traits: string[], edition: string): string {
        const damage = row.damageType ?? row.damageTypes ?? row.damage ?? sys.damage;
        // Accept the editor's already-normalized categorical values on re-import.
        if (typeof damage === 'string' && /^(multiple|mixed|other)$/i.test(damage.trim())) {
            return /^other$/i.test(damage.trim()) ? 'other' : 'multiple';
        }
        const values: string[] = [];
        const add = (val: unknown) => {
            const key = SpellCatalog.text(val).toLowerCase().replace(/\s+damage$/, '');
            const item = DAMAGE_CATEGORIES[key];
            if (item)
                values.push(item);
        };
        if (Array.isArray(damage))
            damage.forEach(d => {
                if (d === null)
                    throw new TypeError('Invalid damage entry.');
                add(typeof d === 'object' ? (field(d, 'type') ?? field(d, 'damageType')) : d);
            });
        else if (asRecord(damage)) {
            const record = asRecord(damage);
            if (!record)
                throw new Error('Invalid damage record.');
            if (record.type || record.value)
                add(record.type ?? record.value);
            else
                Object.values(record).forEach(d => {
                    if (Array.isArray(d))
                        d.forEach(x => {
                            if (x === null)
                                throw new TypeError('Invalid damage entry.');
                            add(field(x, 'type') ?? x);
                        });
                    else
                        add(field(d, 'type') ?? field(d, 'damageType') ?? field(field(d, 'damage'), 'type'));
                });
        }
        else
            SpellCatalog.list(damage).forEach(add);
        if (!values.length)
            traits.forEach(add);
        const distinct = [...new Set(values.map(v => edition === 'remaster' ? (REMASTER_DAMAGE_CATEGORIES[v] || v) : v))];
        if (distinct.length > 1)
            return 'multiple';
        if (distinct.length === 1)
            return distinct[0];
        // Do not infer damage solely from a spell name or an arbitrary description.
        return 'none';
    }
    static area(row: InputRecord, sys: InputRecord): string {
        const area = row.area ?? sys.area;
        let value = SpellCatalog.text(area);
        if (area && typeof area === 'object' && !Array.isArray(area)) {
            const record = asRecord(area);
            if (!record)
                throw new Error('Invalid area record.');
            value = SpellCatalog.text(record.type || record.shape || record.value);
        }
        const s = value.toLowerCase();
        if (!s || /^(none|no|n\/a|—|-)$/.test(s))
            return 'none';
        if (/burst/.test(s))
            return 'Burst';
        if (/cone/.test(s))
            return 'Cone';
        if (/cylinder/.test(s))
            return 'Cylinder';
        if (/emanation/.test(s))
            return 'Emanation';
        if (/line/.test(s))
            return 'Line';
        if (/wall/.test(s))
            return 'Wall';
        if (/variable|varies|multiple|various/.test(s))
            return 'multiple';
        return 'other';
    }
    static range(row: InputRecord, sys: InputRecord): string {
        const value = SpellCatalog.text(row.range ?? sys.range);
        const s = value.toLowerCase();
        if (!s || s === '—' || s === '-' || s === 'none')
            return 'none';
        if (/touch/.test(s))
            return 'Touch';
        if (/^self$|^personal$|^you$/.test(s))
            return 'Self';
        if (/unlimited|anywhere/.test(s))
            return 'Unlimited';
        const mile = s.match(/\b(\d+)\s*mi(?:le|les)?\b/);
        if (mile)
            return mile[1] === '1' ? '1 mile' : 'other';
        const ft = s.match(/\b(\d+(?:\.\d+)?)\s*(?:-?foot|-?feet|ft\.?)/);
        if (ft)
            return `${Number(ft[1])} feet`;
        if (/varies|variable|special|see text|determined/.test(s))
            return 'variable';
        return 'other';
    }
    /** Expanded PF2e spell metadata: discrete categories, no inferred mechanics. */
    static spellType(row: InputRecord, sys: InputRecord, traits: string[]): string {
        const kind = SpellCatalog.text(row.type ?? row.category ?? sys.category ?? sys.type).toLowerCase();
        if (kind.includes('cantrip') || traits.includes('cantrip'))
            return 'Cantrip';
        if (kind.includes('focus') || traits.includes('focus'))
            return 'Focus';
        if (kind.includes('ritual') || traits.includes('ritual'))
            return 'Ritual';
        return 'Spell';
    }
    static castActions(row: InputRecord, sys: InputRecord): string {
        // Read the app's own categorical format before parsing raw PF2e actions.
        const direct = SpellCatalog.text(row.castActions).toLowerCase();
        const selected = CAST_ACTIONS.find(value => value.toLowerCase() === direct);
        if (selected)
            return selected;
        const action = SpellCatalog.text(row.action ?? row.actions ?? field(sys.time, 'value') ?? sys.action).toLowerCase();
        const cast = SpellCatalog.text(row.cast ?? sys.time ?? '').toLowerCase();
        if (/reaction/.test(action))
            return 'Reaction';
        if (/free/.test(action))
            return 'Free action';
        if (/^[123]$/.test(action))
            return `${action} action${action === '1' ? '' : 's'}`;
        if (/^(1|one) action/.test(action))
            return '1 action';
        if (/^(2|two) action/.test(action))
            return '2 actions';
        if (/^(3|three) action/.test(action))
            return '3 actions';
        if (/10\s*minutes?/.test(action + ' ' + cast))
            return '10 minutes';
        if (/\b1\s*minute\b/.test(action + ' ' + cast))
            return '1 minute';
        return 'Other';
    }
    static defenseType(row: InputRecord, sys: InputRecord): string {
        const text = SpellCatalog.text(row.defense ?? row['saving throw'] ?? row.savingThrow ??
            field(field(sys.defense, 'save'), 'statistic') ?? field(sys.save, 'value')).toLowerCase();
        const hits = ['ac', 'fortitude', 'reflex', 'will'].filter(t => new RegExp('\\b' + t + '\\b').test(text));
        if (hits.length > 1)
            return 'Multiple';
        return ({ ac: 'AC', fortitude: 'Fortitude', reflex: 'Reflex', will: 'Will' }[hits[0]]) ||
            (!text ? 'none' : 'Other');
    }
    static durationGroup(row: InputRecord, sys: InputRecord): string {
        const text = SpellCatalog.text(row.duration ?? field(sys.duration, 'value') ?? sys.duration).toLowerCase();
        if (!text || text === 'instantaneous' || text === 'instant')
            return 'Instant';
        if (/sustain/.test(text))
            return 'Sustained';
        if (/daily preparation/.test(text))
            return 'Until preparations';
        if (/\b(?:1|one)\s*round\b|next turn/.test(text))
            return '1 round';
        if (/\b(?:1|one)\s*minute\b/.test(text))
            return '1 minute';
        if (/10\s*minutes?/.test(text))
            return '10 minutes';
        if (/\bhours?\b/.test(text))
            return '1 hour';
        if (/\b(?:days?|weeks?|months?|years?)\b/.test(text))
            return '1 day+';
        if (/varies|variable|depends|see text/.test(text))
            return 'Variable';
        return 'Other';
    }
    static targetGroup(row: InputRecord, sys: InputRecord): string {
        const text = SpellCatalog.text(row.targets ?? row.target ?? field(sys.target, 'value') ?? sys.target).toLowerCase();
        if (!text)
            return (row.area || sys.area) ? 'Area' : 'none';
        if (/^(you|self|yourself)$/.test(text))
            return 'Self';
        if (/\b(?:willing|ally|allies|friendly)\b/.test(text))
            return 'Ally';
        if (/\b(?:objects?|items?|weapon|surface)\b/.test(text))
            return 'Object';
        if (/\b(?:two|three|four|multiple|up to [2-9]|\d+ or \d+|all creatures|every creature)\b/.test(text))
            return 'Multiple creatures';
        if (/\b(?:a|one|1|the triggering)\s+(?:living\s+|undead\s+|willing\s+)?creature\b/.test(text))
            return 'One creature';
        return 'Special';
    }
    static rarityType(row: InputRecord, traits: string[]): string {
        const t = SpellCatalog.text(row.rarity).toLowerCase();
        if (traits.includes('unique') || t === 'unique')
            return 'Unique';
        if (traits.includes('rare') || t === 'rare')
            return 'Rare';
        if (traits.includes('uncommon') || t === 'uncommon')
            return 'Uncommon';
        return 'Common';
    }
    static primaryTrait(traits: string[], row: InputRecord = {}): string {
        const direct = SpellCatalog.text(row.effectTrait).toLowerCase();
        if (direct === 'none')
            return 'none';
        if (direct === 'other')
            return 'Other';
        if (PRIMARY_TRAIT_PRIORITIES.includes(direct))
            return direct[0].toUpperCase() + direct.slice(1);
        const match = PRIMARY_TRAIT_PRIORITIES.find(t => traits.includes(t) ||
            (t === 'summon' && traits.some(x => x.startsWith('summon'))));
        return match ? match[0].toUpperCase() + match.slice(1) : 'none';
    }
    static castingTraits(traits: string[], row: InputRecord): string {
        const direct = SpellCatalog.text(row.castTraits).toLowerCase();
        const selected = CAST_TRAITS.find(value => value.toLowerCase() === direct);
        if (selected)
            return selected;
        const concentrate = traits.includes('concentrate'), manipulate = traits.includes('manipulate');
        if (concentrate && manipulate)
            return 'Both';
        if (concentrate)
            return 'Concentrate';
        if (manipulate)
            return 'Manipulate';
        const components = SpellCatalog.list(row.components ?? row.cast).map(x => x.toLowerCase());
        return components.some(x => ['verbal', 'somatic', 'material'].includes(x)) ? 'Legacy components' : 'none';
    }
    static heightening(row: InputRecord, sys: InputRecord, spellType: string): string {
        const text = SpellCatalog.text(row.description ?? field(sys.description, 'value') ?? sys.description);
        if (spellType === 'Cantrip')
            return 'Automatic cantrip';
        const plus = text.match(/Heightened\s*\(\s*\+(\d+)\s*\)/i);
        if (plus)
            return ['1', '2', '3'].includes(plus[1]) ? `+${plus[1]}` : 'Other';
        if (/Heightened\s*\(\s*\d+(?:st|nd|rd|th)?\s*\)/i.test(text))
            return 'Fixed rank';
        return 'none';
    }
    // Used for deterministic IDs, not for security.
    static fingerprint(text: string): string {
        let hash = 0xcbf29ce484222325n;
        for (let i = 0; i < text.length; i++) {
            hash = BigInt.asUintN(64, (hash ^ BigInt(text.charCodeAt(i))) * 0x100000001b3n);
        }
        return hash.toString(36);
    }
    static assignIdentifiers(entries: PendingSpell[]): void {
        const encoder = new TextEncoder();
        const fit = (base: string, suffix = '') => {
            const chars = [];
            let length = 0;
            for (const char of base) {
                if (length + char.length + suffix.length > MAX_VARIANT_LENGTH)
                    break;
                chars.push(char);
                length += char.length;
            }
            let value = chars.join('') + suffix;
            while (encoder.encode(JSON.stringify([IDENTITY_TAG, value])).length > MAX_IDENTITY_BYTES) {
                chars.pop();
                value = chars.join('') + suffix;
            }
            return value;
        };
        const records = entries.map(entry => {
            const { variant, ...content } = entry;
            const key = JSON.stringify([variant, content]);
            const base = fit(variant || `spell-${SpellCatalog.fingerprint(key)}`);
            return { entry, key, base };
        });
        const counts = new Map<string, number>();
        for (const record of records)
            counts.set(record.base, (counts.get(record.base) || 0) + 1);
        const reserved = new Set(counts.keys()), used = new Set<string>(), nextOrdinal = new Map<string, number>();
        const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
        records.sort((a, b) => compare(a.base, b.base) || compare(a.key, b.key));
        for (const record of records) {
            let variant = record.base;
            const count = counts.get(record.base);
            if (count === undefined)
                throw new Error('Missing catalogue ID count.');
            if (count > 1) {
                const suffix = `-${SpellCatalog.fingerprint(record.key)}`;
                const seed = fit(record.base, suffix);
                let ordinal = nextOrdinal.get(seed) || 2;
                variant = seed;
                while (reserved.has(variant) || used.has(variant)) {
                    variant = fit(record.base, `${suffix}-${ordinal++}`);
                }
                nextOrdinal.set(seed, ordinal);
            }
            used.add(variant);
            record.entry.variant = variant;
            record.entry.id = `entry-${variant}`;
        }
    }
    /** Returns unique normalized PF2e records. Unknown fields are left out. */
    static parse(payload: unknown): ParsedCatalogue {
        const rows = SpellCatalog.rows(payload);
        if (rows.length > MAX_CATALOGUE_SIZE)
            throw new Error(`The spell library is limited to ${MAX_CATALOGUE_SIZE.toLocaleString('en-US')} entries.`);
        const entries: PendingSpell[] = [];
        let skipped = 0;
        for (const rawRow of rows) {
            const row = asRecord(rawRow);
            if (!row) {
                skipped++;
                continue;
            }
            const sys = asRecord(row.system ?? field(row.data, 'system')) ?? {};
            const name = SpellCatalog.text(row.name ?? sys.name);
            const kind = SpellCatalog.text(row.type).toLowerCase();
            if (!name || (kind && !['spell', 'cantrip', 'focus', 'focus spell', 'ritual', 'heightened', ''].includes(kind) && !row.nethysUrl && !sys.level)) {
                skipped++;
                continue;
            }
            const traits = SpellCatalog.list(field(row.traits, 'value') ?? row.traits ?? field(sys.traits, 'value') ?? sys.traits).map(t => t.toLowerCase());
            let edition = SpellCatalog.edition(row.edition ?? row.ruleset ?? row.version ?? row.remaster ?? row.source ?? field(sys.publication, 'title'));
            if (edition === 'both' && Object.prototype.hasOwnProperty.call(row, 'legacy content'))
                edition = 'legacy';
            let identifier = [row.variant, row.sourceId, row.uuid, row._id, row.id, row.slug, row.__objectKey]
                .map(value => SpellCatalog.text(value)).find(Boolean) || '';
            if (!identifier && row.nethysUrl) {
                const match = String(row.nethysUrl).match(/[?&]ID=(\d+)/i);
                if (match)
                    identifier = `aon-${match[1]}`;
            }
            const damage = SpellCatalog.damage(row, sys, traits, edition);
            const spellType = SpellCatalog.spellType(row, sys, traits);
            entries.push({
                name, variant: identifier, edition,
                rank: SpellCatalog.rank(row, sys, traits),
                tradition: SpellCatalog.tradition(row, sys), damage,
                area: SpellCatalog.area(row, sys), range: SpellCatalog.range(row, sys),
                spellType, castActions: SpellCatalog.castActions(row, sys),
                defense: SpellCatalog.defenseType(row, sys),
                duration: SpellCatalog.durationGroup(row, sys),
                targets: SpellCatalog.targetGroup(row, sys),
                rarity: SpellCatalog.rarityType(row, traits),
                effectTrait: SpellCatalog.primaryTrait(traits, row),
                castTraits: SpellCatalog.castingTraits(traits, row),
                heightening: SpellCatalog.heightening(row, sys, spellType),
                source: SpellCatalog.text(row.source ?? field(sys.publication, 'title') ?? field(sys.source, 'value')),
                category: SpellCatalog.text(row.category ?? row.type),
                traits, traditions: SpellCatalog.list(row.traditions ?? row.tradition ?? field(sys.traits, 'traditions')),
                rawAction: SpellCatalog.text(row.action ?? row.actions ?? field(sys.time, 'value') ?? sys.action),
                description: SpellCatalog.text(row.description ?? field(sys.description, 'value') ?? sys.description)
            });
        }
        if (!entries.length)
            throw new Error('No valid spells found. Each entry needs a name.');
        SpellCatalog.assignIdentifiers(entries);
        if (!entries.every((entry): entry is SpellEntry => typeof entry.id === 'string')) {
            throw new Error('Failed to assign catalogue IDs.');
        }
        return { entries, skipped, total: rows.length };
    }
}
