/**
 * Ana fiyat olcegini sabit bir fark kadar kaydirarak gosteren olcek.
 *
 * Ikinci fiyat ekseni (or. GC1 grafiginde XAUUSD) icin: ayni piksel, ana
 * olcekteki fiyatin `offset` eksigine karsilik gelir (offset = ana - karsi).
 * Yakinlastirma/kaydirma ana olcekten gelir; eksen surukleme de ana olcegi
 * olcekler, iki eksen hep birlikte hareket eder.
 */

import { Coordinate, BarPrice, coordinate, barPrice } from './coordinate';
import { PriceMark, PriceScale } from './price-scale';
import { generateAxisValues } from '../helpers/math';

export class OffsetPriceScale {
    offset = 0;

    constructor(private readonly _base: PriceScale) {}

    get height(): number {
        return this._base.height;
    }

    priceToCoordinate(price: number): Coordinate {
        return this._base.priceToCoordinate(price + this.offset);
    }

    coordinateToPrice(y: Coordinate): BarPrice {
        return barPrice(this._base.coordinateToPrice(y) - this.offset);
    }

    marks(): PriceMark[] {
        const height = this._base.height;
        if (!this._base.priceRange || height === 0) return [];
        const a = this.coordinateToPrice(coordinate(height));
        const b = this.coordinateToPrice(coordinate(0));
        const targetCount = Math.max(3, Math.floor(height / 30));
        return generateAxisValues(Math.min(a, b), Math.max(a, b), targetCount)
            .map((price) => ({ price, coord: this.priceToCoordinate(price), label: this.formatPrice(price) }))
            .filter((mark) => mark.coord >= 0 && mark.coord <= height);
    }

    formatPrice(price: number): string {
        return this._base.formatPrice(price);
    }

    startScale(y: number): void {
        this._base.startScale(y);
    }

    scaleTo(y: number): void {
        this._base.scaleTo(y);
    }

    endScale(): void {
        this._base.endScale();
    }
}
