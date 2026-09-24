/** Architect card effects and daemon hooks (contract section 9.1), merged by effects/index.ts.
 *
 * PHASE C (architect agent): register every new Architect card here. Hooks you will need:
 * `channelsGained` (Peering Session), `bandwidthBonus` (Fabric Controller), `switchBonus` (Deep
 * Buffers), `routeTerms` (Carrier Grade), `deviceDeployed` (Provisioning Script, Zero-Touch),
 * `clusterBonus` (Datacenter); turn effects `freeLinks` (Patch Panel), `hardwareDiscount` (Rack and
 * Stack), `discounted` (Blueprint); api.deploy / api.link / api.unlink / api.socketNear (Splice,
 * Standby Router). Branch Line is here already (the Architect starter needs it). */
import type { OwnerEffects } from "./types.ts";

export const ARCHITECT_EFFECTS: OwnerEffects = {
  cards: {
    // Branch Line: "Link two devices. If this adds a channel, draw N." The draw is conditional, so
    // the effect claims `draw` and the generic step skips it.
    "branch-line": {
      manual: ["draw"],
      play: (run, { api, values, before }) => {
        if (api.network(run).channelCount <= before.channels) return;
        const drawn = api.draw(run, values.draw ?? 1).length;
        return ` · new channel, drew ${drawn}`;
      },
    },
  },
  daemons: {},
};
