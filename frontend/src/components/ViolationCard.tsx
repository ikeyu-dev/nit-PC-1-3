import type { ViolationEvent } from "../types";
import { formatYen } from "../game/trafficRules";

type ViolationCardProps = {
    violation: ViolationEvent | null;
    money: number;
};

export function ViolationCard({ violation, money }: ViolationCardProps) {
    if (!violation) {
        return null;
    }

    return (
        <aside className="violation-card" aria-live="polite">
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
