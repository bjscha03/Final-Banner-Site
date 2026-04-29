/**
 * Ruler tick computation for the design preview canvas.
 *
 * The preview canvas uses inches internally (matches existing pricing/PDF
 * pipeline). This utility derives the major + minor tick positions and
 * labels for a measurement ruler shown around the preview, in either
 * `in` or `ft` units.
 *
 * IMPORTANT: This is a pure UI helper — it must never affect pricing,
 * cart serialization, or print-ready exports. The values it returns are
 * positions in INCHES along the ruler axis, so callers can place them
 * directly into the existing inch-based SVG coordinate space.
 */

export type RulerUnit = 'in' | 'ft';

export interface RulerTick {
  /** Position along the axis, in inches (matches existing SVG coords). */
  pos: number;
  /** Label to render. Empty string for unlabeled minor ticks. */
  label: string;
  /** Major ticks get longer marks + labels; minor are short tick lines. */
  major: boolean;
}

export interface GetRulerTicksOptions {
  /** Preferred number of major labels along the axis (caller can hint
   *  fewer for narrow / mobile viewports). */
  maxMajorLabels?: number;
}

/**
 * Generate ruler ticks for one axis.
 *
 * @param lengthIn   total length in inches along this axis
 * @param unit       display unit
 * @param opts.maxMajorLabels  optional cap on label density (mobile)
 */
export function getRulerTicks(
  lengthIn: number,
  unit: RulerUnit,
  opts: GetRulerTicksOptions = {}
): RulerTick[] {
  if (!Number.isFinite(lengthIn) || lengthIn <= 0) return [];

  const maxMajor = opts.maxMajorLabels ?? Infinity;
  const ticks: RulerTick[] = [];

  if (unit === 'ft') {
    const totalFt = lengthIn / 12;

    // Pick a major step (in feet) so we don't exceed maxMajor labels.
    const candidateSteps = [1, 2, 5, 10, 20, 50, 100];
    let stepFt = 1;
    for (const s of candidateSteps) {
      if (Math.floor(totalFt / s) + 1 <= maxMajor) {
        stepFt = s;
        break;
      }
    }

    // Major ticks every stepFt feet, including 0 and the end.
    for (let f = 0; f <= totalFt + 1e-6; f += stepFt) {
      const posIn = Math.min(f * 12, lengthIn);
      ticks.push({
        pos: posIn,
        label: `${formatNumber(f)} ft`,
        major: true,
      });
    }
    // Always include the end as a major tick if not already.
    if (ticks.length === 0 || Math.abs(ticks[ticks.length - 1].pos - lengthIn) > 1e-3) {
      ticks.push({
        pos: lengthIn,
        label: `${formatNumber(totalFt)} ft`,
        major: true,
      });
    }

    // Minor ticks every 1 ft when step is 1 ft (skip if too dense).
    if (stepFt === 1 && totalFt <= 12) {
      // 1 ft majors already cover everything; add half-foot minors.
      for (let f = 0.5; f < totalFt; f += 1) {
        ticks.push({ pos: f * 12, label: '', major: false });
      }
    }
  } else {
    // unit === 'in'
    const totalIn = lengthIn;

    // Pick a major step (in inches).
    const candidateSteps = [1, 2, 5, 6, 10, 12, 24, 48];
    let stepIn = 1;
    for (const s of candidateSteps) {
      if (Math.floor(totalIn / s) + 1 <= maxMajor) {
        stepIn = s;
        break;
      }
    }

    for (let i = 0; i <= totalIn + 1e-6; i += stepIn) {
      const posIn = Math.min(i, totalIn);
      ticks.push({
        pos: posIn,
        label: `${formatNumber(i)} in`,
        major: true,
      });
    }
    if (ticks.length === 0 || Math.abs(ticks[ticks.length - 1].pos - totalIn) > 1e-3) {
      ticks.push({
        pos: totalIn,
        label: `${formatNumber(totalIn)} in`,
        major: true,
      });
    }

    // Minor ticks: every inch when major step >= 5 and total span manageable.
    if (stepIn >= 2 && totalIn <= 96) {
      for (let i = 1; i < totalIn; i++) {
        if (i % stepIn !== 0) {
          ticks.push({ pos: i, label: '', major: false });
        }
      }
    }
  }

  // De-duplicate by position (keep major over minor).
  const byPos = new Map<string, RulerTick>();
  for (const t of ticks) {
    const k = t.pos.toFixed(3);
    const prev = byPos.get(k);
    if (!prev || (t.major && !prev.major)) byPos.set(k, t);
  }
  return Array.from(byPos.values()).sort((a, b) => a.pos - b.pos);
}

function formatNumber(n: number): string {
  // 4 -> "4", 4.5 -> "4.5", 0.25 -> "0.25"
  if (Math.abs(n - Math.round(n)) < 1e-6) return String(Math.round(n));
  return String(Number(n.toFixed(2)));
}
