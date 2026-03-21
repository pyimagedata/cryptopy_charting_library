import { PatternSourceBar, ZigZagPoint } from './types';

export function calculateHarmonicPivots(sourceData: PatternSourceBar[], period: number): ZigZagPoint[] {
    let points: ZigZagPoint[] = [];
    scanHarmonicPivots(sourceData, period, (snapshot) => {
        points = snapshot.slice();
    });
    return points;
}

export function scanHarmonicPivots(
    sourceData: PatternSourceBar[],
    period: number,
    onPivotChange: (points: ZigZagPoint[], currentIndex: number, direction: number) => void
): void {
    const normalizedPeriod = Math.max(2, Math.floor(period));
    if (sourceData.length < normalizedPeriod) {
        return;
    }

    const points: ZigZagPoint[] = [];
    let direction = 0;
    let previousDirection = 0;

    for (let i = normalizedPeriod - 1; i < sourceData.length; i++) {
        const high = sourceData[i].high;
        const low = sourceData[i].low;
        const isPivotHigh = isHighest(sourceData, i, normalizedPeriod);
        const isPivotLow = isLowest(sourceData, i, normalizedPeriod);

        if (isPivotLow && !isPivotHigh) {
            direction = -1;
        } else if (isPivotHigh && !isPivotLow) {
            direction = 1;
        } else {
            direction = previousDirection;
        }

        if (isPivotHigh || isPivotLow) {
            const point: ZigZagPoint = {
                index: i,
                time: sourceData[i].time,
                price: direction === 1 ? high : low,
                kind: direction === 1 ? 'high' : 'low',
            };

            if (direction !== previousDirection) {
                addPivot(points, point);
            } else {
                updatePivot(points, point);
            }
        }

        previousDirection = direction;
        onPivotChange(points.slice(), i, direction);
    }
}

function isHighest(sourceData: PatternSourceBar[], index: number, period: number): boolean {
    const start = index - period + 1;
    if (start < 0) return false;

    for (let i = start; i <= index; i++) {
        if (sourceData[i].high > sourceData[index].high) {
            return false;
        }
    }
    return true;
}

function isLowest(sourceData: PatternSourceBar[], index: number, period: number): boolean {
    const start = index - period + 1;
    if (start < 0) return false;

    for (let i = start; i <= index; i++) {
        if (sourceData[i].low < sourceData[index].low) {
            return false;
        }
    }
    return true;
}

function addPivot(points: ZigZagPoint[], point: ZigZagPoint): boolean {
    if (points.length > 0 && points[0].index === point.index && points[0].kind === point.kind) {
        points[0] = point;
        return true;
    }
    points.unshift(point);
    return true;
}

function updatePivot(points: ZigZagPoint[], point: ZigZagPoint): boolean {
    if (points.length === 0) {
        return addPivot(points, point);
    }

    const current = points[0];
    const shouldReplace = point.kind === 'high'
        ? point.price > current.price
        : point.price < current.price;

    if (shouldReplace) {
        points[0] = point;
        return true;
    }

    return false;
}
