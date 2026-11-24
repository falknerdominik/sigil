const necklaceCache = new Map<number, string[]>();
export function isPrime(number: number): boolean {
    if (number < 2)
        return false;
    for (let k = 2; k * k <= number; k++) {
        if (number % k === 0)
            return false;
    }
    return true;
}
export function nextPrime(number: number): number {
    let candidate = Math.max(3, Math.ceil(number));
    while (!isPrime(candidate))
        candidate++;
    return candidate;
}
export function rotate(bits: string, amount: number): string {
    const count = bits.length;
    const k = ((amount % count) + count) % count;
    return bits.slice(k) + bits.slice(0, k);
}
export function canonicalRotation(bits: string): string {
    let smallest = bits;
    for (let shift = 1; shift < bits.length; shift++) {
        const rotated = rotate(bits, shift);
        if (rotated < smallest)
            smallest = rotated;
    }
    return smallest;
}
export function uniqueNecklaces(n: number): string[] {
    if (!Number.isInteger(n) || n < 3 || n > 37)
        throw new RangeError('Supported polygon sizes are 3..37 nodes.');
    const cached = necklaceCache.get(n);
    if (cached)
        return cached.slice();
    const seen = new Set<string>();
    if (n <= 17) {
        for (let number = 1; number < 2 ** n - 1; number++) {
            const bits = number.toString(2).padStart(n, '0');
            seen.add(canonicalRotation(bits));
        }
    }
    else {
        for (let a = 0; a < n - 3; a++) {
            for (let b = a + 1; b < n - 2; b++) {
                for (let c = b + 1; c < n - 1; c++) {
                    for (let d = c + 1; d < n; d++) {
                        const bits = Array<string>(n).fill('0');
                        bits[a] = bits[b] = bits[c] = bits[d] = '1';
                        seen.add(canonicalRotation(bits.join('')));
                    }
                }
            }
        }
    }
    const result = [...seen].sort();
    necklaceCache.set(n, result);
    return result.slice();
}
export function preferredDictionary(n: number): string[] {
    if (n > 17) {
        const spread = (bits: string): number => {
            const hits: number[] = [];
            for (let i = 0; i < bits.length; i++)
                if (bits[i] === '1')
                    hits.push(i);
            let score = 0;
            for (let j = 0; j < hits.length; j++) {
                const gap = (hits[(j + 1) % hits.length] - hits[j] + bits.length) % bits.length;
                score += (gap - bits.length / hits.length) ** 2;
            }
            return score;
        };
        return uniqueNecklaces(n).sort((a, b) => spread(a) - spread(b) || a.localeCompare(b));
    }
    const preferredWeight = Math.max(3, Math.round(n * 0.36));
    return uniqueNecklaces(n).sort((a, b) => {
        const weightA = a.split('1').length - 1;
        const weightB = b.split('1').length - 1;
        return (Math.abs(weightA - preferredWeight) - Math.abs(weightB - preferredWeight)) ||
            a.localeCompare(b);
    });
}
