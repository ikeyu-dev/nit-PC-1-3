import type { ViolationEvent } from "../types";
import { formatYen } from "../game/trafficRules";

type ViolationCardProps = {
    violation: ViolationEvent | null;
    money: number;
};

export function ViolationCard({ violation, money }: ViolationCardProps) {
    if (!violation) {
        // 違反がない時はカードを出さず、3D画面を広く見せる。
        return null;
    }

    return (
        <aside className="violation-card" aria-live="polite">
            {/* 青切符カードで違反名・反則金・残金・直し方をまとめて見せる。 */}
            <div className="violation-card__header">青切符</div>
            <div className="violation-card__body">
                <p className="violation-card__label">{violation.label}</p>
                <p className="violation-card__fine">-{formatYen(violation.fine)}</p>
                <p className="violation-card__money">残り {formatYen(money)}</p>
                <p className="violation-card__hint">{violation.hint}</p>
            </div>
        </aside>
    );
}
