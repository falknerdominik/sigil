import { isPrime, nextPrime, rotate, canonicalRotation, uniqueNecklaces, preferredDictionary } from './spell-math';
import { IDENTITY_TAG, MAX_IDENTITY_BYTES } from './constants';

export type SpellValues = Record<string, unknown> & {
    variant?: unknown;
    rank?: unknown;
};
export interface AttributeDefinition {
    id: string;
    label?: string;
    color?: string;
    options: { value: string | number; label?: string }[];
}
interface PreparedAttribute extends AttributeDefinition {
    lookup: Map<string, string>;
}
interface ChordAttribute extends PreparedAttribute {
    k: number;
}
interface OrbitAttribute extends PreparedAttribute {
    sectionUnits: number;
}
export interface ChordGroup extends Pick<AttributeDefinition, 'id' | 'label' | 'color'> {
    k: number;
    edges: number[][];
}
/** One combined Layer 2 orbit at a vertex. */
export interface Orbit {
    vertex: number;
    units: number;
    sweep: number;
}
export interface SpellNotation {
    vertexCount: number;
    chords: ChordGroup[];
    orbits: Orbit[];
    identityBits: string;
}
export interface VisibleNotation extends Pick<SpellNotation, 'chords' | 'orbits'> {
    revealFraction: number;
    optionalVisible: number;
    optionalTotal: number;
    revealCount: number;
    totalRevealable: number;
}
export interface SpellRepresentation {
    complete: SpellNotation;
    visible: VisibleNotation;
}
type Detail = {
    kind: 'edge';
    chordIndex: number;
    edge: number[];
} | {
    kind: 'orbit';
    orbit: Orbit;
};

/** Encodes spell attributes as chords, vertex orbits, and source-ID bits. */
export class SpellCalculation {
    vertexCount = 0;
    dictionary: string[] = [];
    chordAttributes: ChordAttribute[] = [];
    orbitAttributes: OrbitAttribute[] = [];
    constructor(chordAttributes: AttributeDefinition[], orbitAttributes: AttributeDefinition[] = []) {
        this.setChordAttributes(chordAttributes);
        this.setOrbitAttributes(orbitAttributes);
    }
    static isPrime = isPrime;
    static nextPrime = nextPrime;
    static rotate = rotate;
    static canonicalRotation = canonicalRotation;
    static uniqueNecklaces = uniqueNecklaces;
    static preferredDictionary = preferredDictionary;
    setChordAttributes(attributes: AttributeDefinition[]): void {
        if (!Array.isArray(attributes) || !attributes.length) {
            throw new TypeError('At least one attribute is required.');
        }
        // Prime n >= 2m + 1 gives m chord families and rotation-unique words.
        this.vertexCount = nextPrime(2 * attributes.length + 1);
        const limit = Math.floor((this.vertexCount - 1) / 2);
        if (attributes.length > limit)
            throw new Error('Not enough distinct chord families.');
        this.dictionary = preferredDictionary(this.vertexCount);
        this.chordAttributes = this.prepareAttributes(attributes).map((attribute, index) => ({
            ...attribute, k: index + 1
        }));
        this.setOrbitAttributes(this.orbitAttributes);
    }
    private prepareAttributes(attributes: AttributeDefinition[], offset = 0): PreparedAttribute[] {
        return attributes.map((attribute, index) => {
            // Option order determines the bit mapping; "none" is all zeros.
            const meaningful = attribute.options.filter(option => option.value !== 'none');
            if (meaningful.length > this.dictionary.length) {
                throw new Error('Too many values for attribute ' + attribute.id);
            }
            const lookup = new Map<string, string>();
            meaningful.forEach((option, valueIndex) => {
                // With 11 vertices, the attribute-offset term cancels modulo 11.
                const orientation = ((offset + index) * 11 + valueIndex * 7 + 3) % this.vertexCount;
                lookup.set(String(option.value), rotate(this.dictionary[valueIndex], orientation));
            });
            lookup.set('none', '0'.repeat(this.vertexCount));
            return { ...attribute, lookup };
        });
    }
    setOrbitAttributes(attributes: AttributeDefinition[] = []): void {
        if (!Array.isArray(attributes))
            throw new TypeError('Secondary attributes must be an array.');
        if (attributes.length > 8)
            throw new RangeError('At most eight orbit attributes are supported.');
        // Powers of two make each combination at a vertex distinguishable.
        this.orbitAttributes = this.prepareAttributes(attributes, this.chordAttributes.length).map((attribute, index) => ({
            ...attribute, sectionUnits: 2 ** index
        }));
    }
    private selectedVertices(attribute: PreparedAttribute, spell: SpellValues): number[] {
        const selected = String(spell[attribute.id] ?? 'none');
        const bits = attribute.lookup.get(selected);
        if (!bits)
            throw new Error('Unknown ' + attribute.id + ' value: ' + selected);
        const vertices: number[] = [];
        for (let i = 0; i < this.vertexCount; i++)
            if (bits[i] === '1')
                vertices.push(i);
        return vertices;
    }
    static encodeIdentity(spell: SpellValues): string {
        const fields = [IDENTITY_TAG, String(spell.variant || '')];
        const bytes = new TextEncoder().encode(JSON.stringify(fields));
        if (bytes.length > MAX_IDENTITY_BYTES) {
            throw new RangeError(`Spell ID is too long for a legible Layer 3 ring (${MAX_IDENTITY_BYTES} UTF-8 bytes maximum). Use a shorter ID.`);
        }
        // Prefix the UTF-8 payload with its 16-bit byte length.
        return bytes.length.toString(2).padStart(16, '0') +
            Array.from(bytes, byte => byte.toString(2).padStart(8, '0')).join('');
    }
    static decodeIdentity(bits: string): {
        variant: string;
    } {
        if (typeof bits !== 'string' || !/^[01]+$/.test(bits) || bits.length < 16) {
            throw new Error('Invalid spell identity bits.');
        }
        const byteLength = Number.parseInt(bits.slice(0, 16), 2);
        if (bits.length !== 16 + byteLength * 8)
            throw new Error('Invalid identity length.');
        const bytes = Uint8Array.from({ length: byteLength }, (_, i) => Number.parseInt(bits.slice(16 + i * 8, 24 + i * 8), 2));
        const fields: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        if (!Array.isArray(fields) || fields.length !== 2 || fields[0] !== IDENTITY_TAG ||
            fields.some(field => typeof field !== 'string')) {
            throw new Error('Invalid spell ID payload.');
        }
        return { variant: fields[1] };
    }
    static combineOrbits(vertexCount: number, attributes: { vertices: number[]; sectionUnits: number }[]): Orbit[] {
        if (!attributes.length)
            return [];
        const units = Array<number>(vertexCount).fill(0);
        for (const attribute of attributes) {
            for (const vertexIndex of attribute.vertices)
                units[vertexIndex] += attribute.sectionUnits;
        }
        // One orbit's sweep encodes the sum of its active attribute weights.
        const anglePerUnit = (2 * Math.PI) / (2 ** attributes.length - 1);
        return units.flatMap((total, vertex) => total ? [{ vertex, units: total, sweep: total * anglePerUnit }] : []);
    }
    static decodeOrbitSections(units: number, attributes: Pick<AttributeDefinition, 'id'>[]): string[] {
        const maximum = 2 ** attributes.length;
        if (!Number.isInteger(units) || units < 0 || units >= maximum) {
            throw new RangeError('Invalid orbit section count.');
        }
        return attributes.filter((_, index) => (units & (2 ** index)) !== 0).map(attribute => attribute.id);
    }
    encode(spell: SpellValues): SpellNotation {
        // Layer 1 maps active starting vertices to a chord family.
        const chords = this.chordAttributes.map(attribute => ({
            id: attribute.id, label: attribute.label, color: attribute.color, k: attribute.k,
            edges: this.selectedVertices(attribute, spell).map(i => [i, (i + attribute.k) % this.vertexCount])
        }));
        // Layer 2 combines attribute weights into one orbit per active vertex.
        const orbitAttributes = this.orbitAttributes.map(attribute => ({
            sectionUnits: attribute.sectionUnits, vertices: this.selectedVertices(attribute, spell)
        }));
        return {
            vertexCount: this.vertexCount, chords,
            orbits: SpellCalculation.combineOrbits(this.vertexCount, orbitAttributes),
            identityBits: SpellCalculation.encodeIdentity(spell)
        };
    }
    represent(spell: SpellValues, rankComplexity = true): SpellRepresentation {
        const complete = this.encode(spell);
        const visible = SpellCalculation.applyRankComplexity(complete, spell, rankComplexity);
        return {complete, visible};
    }
    static rankRevealFraction(rankValue: unknown): number {
        const value = String(rankValue ?? '').toLowerCase().trim();
        if (value === 'cantrip')
            return 0.2;
        const rank = Number.parseInt(value, 10);
        if (!Number.isFinite(rank))
            return 1;
        if (rank <= 3)
            return 0.4;
        if (rank <= 6)
            return 0.6;
        if (rank <= 8)
            return 0.8;
        return 1;
    }
    static detailDrawOrder(encoded: SpellNotation): Detail[] {
        const edgePools: Detail[][] = encoded.chords.flatMap((group, chordIndex) => group.id === 'rank' ? [] : [group.edges.map(edge => ({ kind: 'edge', chordIndex, edge }))]);
        const orbitPool: Detail[] = encoded.orbits.slice().sort((a, b) => a.vertex - b.vertex)
            .map(orbit => ({ kind: 'orbit', orbit }));
        // Interleave chord families and whole orbits for balanced rank filtering.
        const pools = edgePools.length ? [edgePools[0], orbitPool, ...edgePools.slice(1)] : [orbitPool];
        const order: Detail[] = [];
        const largest = Math.max(0, ...pools.map(pool => pool.length));
        for (let depth = 0; depth < largest; depth++) {
            for (const pool of pools)
                if (pool[depth])
                    order.push(pool[depth]);
        }
        return order;
    }
    static applyRankComplexity(encoded: SpellNotation, spell: SpellValues, enabled = true): VisibleNotation {
        // Keep rank chords and identity intact; filter only the visible view.
        const rankIndex = encoded.chords.findIndex(group => group.id === 'rank');
        const rankEdges = rankIndex >= 0 ? encoded.chords[rankIndex].edges.length : 0;
        const detail = SpellCalculation.detailDrawOrder(encoded);
        const revealFraction = enabled ? SpellCalculation.rankRevealFraction(spell.rank) : 1;
        const optionalCount = Math.min(detail.length, Math.ceil(detail.length * revealFraction));
        const chords = encoded.chords.map(group => ({ ...group, edges: [] as number[][] }));
        if (rankIndex >= 0)
            chords[rankIndex].edges = encoded.chords[rankIndex].edges.slice();
        const orbits: Orbit[] = [];
        for (const item of detail.slice(0, optionalCount)) {
            if (item.kind === 'edge')
                chords[item.chordIndex].edges.push(item.edge);
            else
                orbits.push(item.orbit);
        }
        return {
            chords, orbits, revealFraction,
            optionalVisible: optionalCount, optionalTotal: detail.length,
            revealCount: rankEdges + optionalCount, totalRevealable: rankEdges + detail.length
        };
    }
}
