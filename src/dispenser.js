/**
 * Single choke-point for actually dispensing one unit of a medicine.
 *
 * Today this is pure software — there's no physical vending machine
 * connected yet, so it just reports success immediately. Once real hardware
 * is wired up (e.g. a small bridge program on a Raspberry Pi next to the
 * machine, listening for commands from this server), this is the ONLY
 * function that needs to change: swap the body for a real call to that
 * bridge, and don't resolve `dispensed: true` until the machine itself
 * confirms the item actually dropped — not the moment the command is sent.
 * That way a jam or an empty slot can report failure instead of silently
 * marking a prescription as dispensed when nothing physically happened.
 *
 * @returns {Promise<{ dispensed: boolean, reason?: string }>}
 */
async function dispenseMedicine({ name, quantityRequested = 1 }) {
  // TODO (hardware integration): replace this with a real call to the
  // machine's bridge and await its confirmation instead of assuming success.
  return { dispensed: true };
}

module.exports = { dispenseMedicine };
