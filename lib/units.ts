// Keeps live YouCam use inside the free units, so a visitor cannot spend the whole allowance.
// It resets when the server restarts, which is enough for a demo. YOUCAM_UNIT_BUDGET sets the limit.

let spent = 0;

export const unitsLeft = () => Number(process.env.YOUCAM_UNIT_BUDGET ?? 400) - spent;

/** Takes the units before the work starts, so requests arriving together cannot overspend. */
export function reserve(units: number) {
  if (unitsLeft() < units) return false;
  spent += units;
  return true;
}

/** YouCam charges only for success, so a failed call gives its units back. */
export function refund(units: number) {
  spent = Math.max(0, spent - units);
}
