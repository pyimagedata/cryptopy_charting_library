import { BarData } from '../model/data';

export interface PatternPoint {
    index: number;
    time: number;
    price: number;
}

export interface ZigZagPoint extends PatternPoint {
    kind: 'high' | 'low';
}

export interface ZigZagOptions {
    period: number;
}

export interface ABCDPattern {
    points: [ZigZagPoint, ZigZagPoint, ZigZagPoint, ZigZagPoint];
    direction: 'bullish' | 'bearish';
    bcRatio: number;
    cdRatio: number;
    abCdRatio: number;
    extensionOne: number;
    extension1272: number;
}

export type PatternSourceBar = BarData;
