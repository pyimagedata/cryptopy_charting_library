import { PatternSourceBar, ZigZagOptions, ZigZagPoint } from './types';

export function calculateZigZagPoints(
    sourceData: PatternSourceBar[],
    options: ZigZagOptions
): ZigZagPoint[] {
    const period = Math.max(2, Math.floor(options.period));

    if (sourceData.length < period) {
        return [];
    }

    const zigzag: ZigZagPoint[] = [];
    let direction = 0;
    let previousDirection = 0;

    for (let i = period - 1; i < sourceData.length; i++) {
        const high = sourceData[i].high;
        const low = sourceData[i].low;
        const isPivotHigh = _isHighest(sourceData, i, period);
        const isPivotLow = _isLowest(sourceData, i, period);

        if (isPivotLow && !isPivotHigh) {
            direction = -1;
        } else if (isPivotHigh && !isPivotLow) {
            direction = 1;
        } else {
            direction = previousDirection;
        }

        if (!isPivotHigh && !isPivotLow) {
            continue;
        }

        const value = direction === 1 ? high : low;
        const kind: 'high' | 'low' = direction === 1 ? 'high' : 'low';
        const changed = direction !== previousDirection;

        if (changed) {
            _addPivot(zigzag, {
                index: i,
                time: sourceData[i].time,
                price: value,
                kind,
            });
        } else {
            _updatePivot(zigzag, {
                index: i,
                time: sourceData[i].time,
                price: value,
                kind,
            });
        }

        previousDirection = direction;
    }

    return zigzag;
}

function _isHighest(sourceData: PatternSourceBar[], index: number, period: number): boolean {
    const start = index - period + 1;
    if (start < 0) return false;

    for (let i = start; i <= index; i++) {
        if (sourceData[i].high > sourceData[index].high) {
            return false;
        }
    }
    return true;
}

function _isLowest(sourceData: PatternSourceBar[], index: number, period: number): boolean {
    const start = index - period + 1;
    if (start < 0) return false;

    for (let i = start; i <= index; i++) {
        if (sourceData[i].low < sourceData[index].low) {
            return false;
        }
    }
    return true;
}

function _addPivot(points: ZigZagPoint[], point: ZigZagPoint): void {
    if (points.length > 0 && points[0].index === point.index && points[0].kind === point.kind) {
        points[0] = point;
        return;
    }
    points.unshift(point);
}

function _updatePivot(points: ZigZagPoint[], point: ZigZagPoint): void {
    if (points.length === 0) {
        _addPivot(points, point);
        return;
    }

    const current = points[0];
    const shouldReplace = point.kind === 'high'
        ? point.price > current.price
        : point.price < current.price;

    if (shouldReplace) {
        points[0] = point;
    }
}
