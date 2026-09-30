/**
 * Fare surukleme oturumu (ör. fiyat ekseninde olcekleme). Surukleme sirasinda
 * olaylar document'tan dinlenir; oturum su durumlardan HERHANGI biriyle biter:
 *
 * - mouseup
 * - tus basili degilken gelen bir mousemove (mouseup kaybolmus demektir: fare
 *   iframe'in/pencerenin disinda birakildiysa -- ozellikle Safari -- ya da
 *   baska bir pencereye gecildiyse bu olay hic gelmez ve eksen imlece
 *   "yapisik" kalirdi; kullanici eksene tekrar tiklayana kadar)
 * - pencere odagi kaybi (blur)
 *
 * Donen fonksiyon oturumu elle bitirir (ör. yeni bir mousedown'da eskisini kapatmak icin).
 */
export function startDragSession(onMove: (e: MouseEvent) => void, onEnd: () => void): () => void {
    let active = true;
    const end = () => {
        if (!active) return;
        active = false;
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', end);
        window.removeEventListener('blur', end);
        onEnd();
    };
    const move = (e: MouseEvent) => {
        if ((e.buttons & 1) === 0) {
            end();
            return;
        }
        onMove(e);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', end);
    window.addEventListener('blur', end);
    return end;
}
