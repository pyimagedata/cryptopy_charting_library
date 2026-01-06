/**
 * Technical Rating Badge Widget
 * 
 * Displays TradingView technical analysis ratings in the top-right corner of the chart.
 * Modern glassmorphism design with gradient backgrounds.
 */

import { TechnicalRating, getRatingLabel, fetchTechnicalRating } from '../services/technical-rating-service';

/**
 * Technical Rating Badge Widget
 */
export class TechnicalRatingBadge {
    private readonly _element: HTMLElement;
    private _currentRating: TechnicalRating | null = null;
    private _isLoading: boolean = false;

    constructor(container: HTMLElement) {
        this._element = this._createElement();
        container.appendChild(this._element);
        console.log('🏷️ TechnicalRatingBadge created and appended to container');
    }

    private _createElement(): HTMLElement {
        const el = document.createElement('div');
        el.id = 'tv-technical-rating-badge';
        el.style.cssText = `
            position: absolute;
            top: 12px;
            right: 85px;
            z-index: 50;
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 8px;
            pointer-events: auto;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        `;

        // Inject modern styles
        if (!document.getElementById('tv-rating-badge-styles')) {
            const style = document.createElement('style');
            style.id = 'tv-rating-badge-styles';
            style.textContent = `
                #tv-technical-rating-badge .rating-card {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: 8px 14px;
                    border-radius: 8px;
                    background: rgba(20, 24, 32, 0.85);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
                    min-width: 85px;
                    transition: transform 0.2s ease, box-shadow 0.2s ease;
                }
                #tv-technical-rating-badge .rating-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
                }
                #tv-technical-rating-badge .rating-label {
                    font-size: 9px;
                    color: rgba(255, 255, 255, 0.5);
                    font-weight: 500;
                    text-transform: uppercase;
                    letter-spacing: 0.8px;
                    margin-bottom: 4px;
                }
                #tv-technical-rating-badge .rating-value {
                    font-size: 11px;
                    font-weight: 700;
                    padding: 4px 10px;
                    border-radius: 4px;
                    text-align: center;
                    white-space: nowrap;
                    letter-spacing: 0.3px;
                }
                #tv-technical-rating-badge .rating-value.strong-buy {
                    background: linear-gradient(135deg, #26a69a 0%, #00897b 100%);
                    color: #ffffff;
                    box-shadow: 0 2px 8px rgba(38, 166, 154, 0.4);
                }
                #tv-technical-rating-badge .rating-value.buy {
                    background: linear-gradient(135deg, #66bb6a 0%, #43a047 100%);
                    color: #ffffff;
                    box-shadow: 0 2px 8px rgba(102, 187, 106, 0.4);
                }
                #tv-technical-rating-badge .rating-value.neutral {
                    background: linear-gradient(135deg, #78909c 0%, #546e7a 100%);
                    color: #ffffff;
                    box-shadow: 0 2px 8px rgba(120, 144, 156, 0.4);
                }
                #tv-technical-rating-badge .rating-value.sell {
                    background: linear-gradient(135deg, #ff7043 0%, #f4511e 100%);
                    color: #ffffff;
                    box-shadow: 0 2px 8px rgba(255, 112, 67, 0.4);
                }
                #tv-technical-rating-badge .rating-value.strong-sell {
                    background: linear-gradient(135deg, #ef5350 0%, #e53935 100%);
                    color: #ffffff;
                    box-shadow: 0 2px 8px rgba(239, 83, 80, 0.4);
                }
                #tv-technical-rating-badge .loading-state {
                    color: rgba(255, 255, 255, 0.4);
                    font-size: 10px;
                    padding: 12px 16px;
                }
            `;
            document.head.appendChild(style);
        }

        // Initial loading state
        el.innerHTML = `
            <div class="rating-card">
                <span class="loading-state">⏳</span>
            </div>
        `;

        return el;
    }

    private _getRatingClass(rating: number): string {
        if (rating <= -0.5) return 'strong-sell';
        if (rating <= -0.1) return 'sell';
        if (rating <= 0.1) return 'neutral';
        if (rating <= 0.5) return 'buy';
        return 'strong-buy';
    }

    /**
     * Update rating display
     */
    async updateRating(symbol: string, timeframe: string): Promise<void> {
        if (this._isLoading) return;

        this._isLoading = true;
        console.log(`🏷️ Fetching rating for ${symbol} @ ${timeframe}`);

        try {
            const rating = await fetchTechnicalRating(symbol, 'BINANCE', timeframe);
            console.log('🏷️ Rating received:', rating);
            this._currentRating = rating;
            this._render();
        } catch (error) {
            console.warn('🏷️ Failed to fetch technical rating:', error);
            this._showError();
        } finally {
            this._isLoading = false;
        }
    }

    private _showError(): void {
        this._element.innerHTML = `
            <div class="rating-card">
                <span class="loading-state">⚠️</span>
            </div>
        `;
    }

    private _render(): void {
        if (!this._currentRating) {
            this._element.innerHTML = `
                <div class="rating-card">
                    <span class="loading-state">N/A</span>
                </div>
            `;
            return;
        }

        const rating = this._currentRating;
        const techLabel = getRatingLabel(rating.technicalRating);
        const maLabel = getRatingLabel(rating.maRating);
        const techClass = this._getRatingClass(rating.technicalRating);
        const maClass = this._getRatingClass(rating.maRating);

        this._element.innerHTML = `
            <div class="rating-card">
                <span class="rating-label">Technical</span>
                <span class="rating-value ${techClass}">${techLabel.text}</span>
            </div>
            <div class="rating-card">
                <span class="rating-label">MA Rating</span>
                <span class="rating-value ${maClass}">${maLabel.text}</span>
            </div>
        `;
    }

    /**
     * Show/hide the badge
     */
    setVisible(visible: boolean): void {
        this._element.style.display = visible ? 'flex' : 'none';
    }

    /**
     * Dispose
     */
    dispose(): void {
        this._element.remove();
    }
}
